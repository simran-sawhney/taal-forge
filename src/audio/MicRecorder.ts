/**
 * MicRecorder.ts
 *
 * Microphone input, reverb routing, and MediaRecorder-based capture
 * for TaalForge.
 *
 * Signal chain (when reverb is active):
 *
 *   MediaStream ──► MediaStreamSourceNode
 *                         │
 *                         ▼
 *                     micGainNode ─────────────────────► masterGain
 *                         │                               (dry path)
 *                         └──► engine.getReverbSend()
 *                                      │                  (wet path via
 *                                      ▼                   CoreAudioEngine)
 *                                  convolver ──► wetGain ──► masterGain
 *
 * When reverbMix is 0, the reverbSend connection is omitted and the mic
 * feeds only the dry path.
 */

import CoreAudioEngine from './CoreAudioEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best-effort list of MIME types to try for MediaRecorder, in preference order. */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

/**
 * Returns the first MIME type in PREFERRED_MIME_TYPES that the current
 * browser's MediaRecorder implementation supports, or an empty string if
 * none are supported (the browser will pick its own default).
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// MicRecorder
// ---------------------------------------------------------------------------

export default class MicRecorder {
  // ── Dependencies ───────────────────────────────────────────────────────────

  /** Reference to the shared audio engine. */
  private readonly engine: CoreAudioEngine;

  // ── Web Audio nodes ────────────────────────────────────────────────────────

  /** Source node wrapping the live microphone MediaStream. */
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  /**
   * Gain node for microphone input level control.
   * Sits between the source node and the rest of the graph.
   */
  private micGainNode: GainNode | null = null;

  // ── MediaStream / MediaRecorder state ─────────────────────────────────────

  /** The raw microphone MediaStream from getUserMedia. */
  private micStream: MediaStream | null = null;

  /**
   * A MediaStreamDestinationNode connected to the master output,
   * used as the input source for MediaRecorder.
   */
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;

  /** The active MediaRecorder instance. */
  private mediaRecorder: MediaRecorder | null = null;

  /** Accumulated audio chunks during recording. */
  private recordingChunks: Blob[] = [];

  /** Whether the mic source node is currently connected to the graph. */
  private _isActive = false;

  /** Whether reverb send is currently patched in. */
  private reverbConnected = false;

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * @param engine - An initialized CoreAudioEngine instance.
   *                 The engine must have had `initialize()` awaited before
   *                 any MicRecorder methods are called.
   */
  constructor(engine: CoreAudioEngine) {
    this.engine = engine;
  }

  // ── Permission ────────────────────────────────────────────────────────────

  /**
   * Requests microphone permission from the browser.
   *
   * @returns `true` if the user granted microphone access, `false` otherwise.
   */
  public async requestPermission(): Promise<boolean> {
    try {
      // We request a temporary stream purely to trigger the permission dialog.
      // The stream is released immediately; the real stream is acquired in start().
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      testStream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.warn('[MicRecorder] Microphone permission denied or unavailable:', err);
      return false;
    }
  }

  // ── Activation ────────────────────────────────────────────────────────────

  /**
   * Opens the microphone stream and connects it into the audio engine's graph.
   *
   * @param reverbMix - 0 = dry only, 1 = route entirely through reverb send.
   *                    Values in between are not linearly interpolated on the
   *                    send gain — for full wet/dry blending, use
   *                    `engine.setReverbMix()` in addition.
   *
   * If the mic is already active, this method is a no-op.
   */
  public async start(reverbMix: number): Promise<void> {
    if (this._isActive) return;

    const ctx = this.engine.getContext();

    // 1. Acquire the live microphone stream.
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });

    // 2. Wrap the stream in a Web Audio source node.
    this.sourceNode = ctx.createMediaStreamSource(this.micStream);

    // 3. Mic gain node — allows level control independent of master volume.
    this.micGainNode = this.engine.createGain(1.0);

    // 4. Connect source → micGain → masterGain (dry path).
    this.sourceNode.connect(this.micGainNode);
    this.micGainNode.connect(this.engine.getMasterGain());

    // 5. Optionally patch in the reverb send.
    if (reverbMix > 0) {
      this.micGainNode.connect(this.engine.getReverbSend());
      this.reverbConnected = true;
      // Honour the requested mix level.
      this.engine.setReverbMix(Math.max(0, Math.min(1, reverbMix)));
    }

    // 6. Create a recording destination node tapped from the master gain,
    //    so recordings capture the full processed signal including reverb.
    this.recordingDestination = ctx.createMediaStreamDestination();
    this.engine.getMasterGain().connect(this.recordingDestination);

    this._isActive = true;
  }

  /**
   * Disconnects the microphone from the audio graph and releases the stream.
   * Also stops any in-progress recording (the recorded data is discarded).
   * Safe to call even if the mic is not currently active.
   */
  public stop(): void {
    if (!this._isActive) return;

    // Stop any active recording without resolving — data is discarded.
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
      this.recordingChunks = [];
    }

    // Disconnect audio nodes.
    if (this.micGainNode) {
      this.micGainNode.disconnect();
      this.micGainNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.recordingDestination) {
      // Disconnect the tap from the master gain.
      try {
        this.engine.getMasterGain().disconnect(this.recordingDestination);
      } catch {
        // Harmless if already disconnected.
      }
      this.recordingDestination = null;
    }

    // Stop all microphone tracks to release the device.
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    this.reverbConnected = false;
    this._isActive = false;
  }

  // ── Gain control ──────────────────────────────────────────────────────────

  /**
   * Adjusts the microphone input gain.
   * @param level - Linear gain value, clamped to [0, 1].
   */
  public setMicGain(level: number): void {
    if (!this.micGainNode) {
      console.warn('[MicRecorder] setMicGain called before mic is active.');
      return;
    }
    const clamped = Math.max(0, Math.min(1, level));
    const now = this.engine.getContext().currentTime;
    this.micGainNode.gain.setTargetAtTime(clamped, now, 0.01);
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  /**
   * Starts capturing audio via MediaRecorder.
   * The recording source is the engine's master output (post-reverb),
   * so it captures exactly what the user hears.
   *
   * Throws if the mic is not currently active or if a recording is already
   * in progress.
   */
  public startRecording(): void {
    if (!this._isActive || !this.recordingDestination) {
      throw new Error(
        '[MicRecorder] startRecording() requires the mic to be active. ' +
        'Call await start() first.',
      );
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      throw new Error('[MicRecorder] A recording is already in progress.');
    }

    this.recordingChunks = [];

    const mimeType = getSupportedMimeType();
    const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};

    this.mediaRecorder = new MediaRecorder(
      this.recordingDestination.stream,
      recorderOptions,
    );

    this.mediaRecorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data && event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    // Request data every 100 ms to ensure we get chunks even for short clips.
    this.mediaRecorder.start(100);
  }

  /**
   * Stops the active MediaRecorder and resolves with the complete audio Blob.
   *
   * @returns A Promise that resolves to the recorded audio as a Blob.
   * @throws  If no recording is in progress.
   */
  public stopRecording(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('[MicRecorder] stopRecording() called but no recording is active.'));
        return;
      }

      const recorder = this.mediaRecorder;
      const chunks = this.recordingChunks;

      recorder.onstop = (): void => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        this.recordingChunks = [];
        this.mediaRecorder = null;
        resolve(blob);
      };

      recorder.onerror = (event: Event): void => {
        this.recordingChunks = [];
        this.mediaRecorder = null;
        reject(new Error(`[MicRecorder] MediaRecorder error: ${(event as ErrorEvent).message}`));
      };

      recorder.stop();
    });
  }

  // ── Download helper ───────────────────────────────────────────────────────

  /**
   * Triggers a browser download for the provided audio Blob.
   *
   * @param blob     - The recorded audio Blob (from stopRecording()).
   * @param filename - Optional file name.  Defaults to a timestamped name.
   */
  public downloadRecording(blob: Blob, filename?: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Derive an appropriate extension from the MIME type.
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = filename ?? `taalforge-recording-${timestamp}.${ext}`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;

    // Append to body (required in some browsers), click, then clean up.
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Revoke after a short delay to ensure the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ── State getter ──────────────────────────────────────────────────────────

  /**
   * `true` if the microphone is currently connected to the audio graph.
   */
  public get isActive(): boolean {
    return this._isActive;
  }
}
