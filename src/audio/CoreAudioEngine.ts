/**
 * CoreAudioEngine.ts
 *
 * Singleton master audio engine for TaalForge.
 *
 * Responsibilities:
 *  - Own and manage the single AudioContext for the session.
 *  - Provide a master GainNode for overall volume control.
 *  - Generate a convolution reverb (programmatic impulse response) with
 *    wet/dry mix control.
 *  - Host and control the lookahead scheduler Web Worker.
 *  - Expose utility factory methods (createGain) used by instrument engines.
 *
 * Usage:
 *   const engine = CoreAudioEngine.getInstance();
 *   await engine.initialize();           // call on first user gesture
 *   engine.startScheduler(onTick, 120);  // start clock at 120 BPM
 */

// Vite ?worker import — the bundler converts this into a Worker constructor.
import SchedulerWorkerCtor from './SchedulerWorker.ts?worker';

// ---------------------------------------------------------------------------
// Worker message types (mirrored from SchedulerWorker.ts)
// ---------------------------------------------------------------------------

interface WorkerStartMessage {
  type: 'start';
  bpm: number;
  lookahead: number;
}

interface WorkerStopMessage {
  type: 'stop';
}

interface WorkerSetBpmMessage {
  type: 'setBpm';
  bpm: number;
}

interface WorkerSetLookaheadMessage {
  type: 'setLookahead';
  ms: number;
}

type WorkerOutgoingMessage =
  | WorkerStartMessage
  | WorkerStopMessage
  | WorkerSetBpmMessage
  | WorkerSetLookaheadMessage;

interface WorkerTickMessage {
  type: 'tick';
}

// ---------------------------------------------------------------------------
// CoreAudioEngine
// ---------------------------------------------------------------------------

export default class CoreAudioEngine {
  // ── Singleton ─────────────────────────────────────────────────────────────

  private static instance: CoreAudioEngine | null = null;

  /**
   * Returns the single shared engine instance.
   * The engine is NOT yet usable until `initialize()` has been awaited.
   */
  public static getInstance(): CoreAudioEngine {
    if (!CoreAudioEngine.instance) {
      CoreAudioEngine.instance = new CoreAudioEngine();
    }
    return CoreAudioEngine.instance;
  }

  // ── Audio graph nodes ─────────────────────────────────────────────────────

  /** The underlying AudioContext. Null until initialize() resolves. */
  private _ctx: AudioContext | null = null;

  /** Master output gain — sits just before ctx.destination. */
  private _masterGain: GainNode | null = null;

  /**
   * Dry gain: receives all direct (non-reverb) signal.
   * Feeds into masterGain.
   */
  private dryGain: GainNode | null = null;

  /**
   * Wet gain: scales the convolver output before masterGain.
   * Setting this to 0 effectively bypasses reverb.
   */
  private wetGain: GainNode | null = null;

  /**
   * Reverb send bus.  Instrument engines connect here when they want
   * reverb applied.  Feeds into the ConvolverNode.
   */
  private _reverbSend: GainNode | null = null;

  /** Convolution reverb node loaded with the generated impulse response. */
  private convolver: ConvolverNode | null = null;

  // ── Scheduler ─────────────────────────────────────────────────────────────

  /** The scheduler Web Worker instance. */
  private schedulerWorker: Worker | null = null;

  /** Callback invoked on every scheduler tick. */
  private tickCallback: (() => void) | null = null;

  /** Whether initialize() has been called and completed. */
  private initialized = false;

  // ── Private constructor (singleton) ───────────────────────────────────────

  private constructor() {
    // Intentionally empty — construction is lazy; see initialize().
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Creates the AudioContext and builds the signal chain.
   * Must be called from a user-gesture handler (click / keydown) to satisfy
   * browser autoplay policies.
   *
   * Calling initialize() more than once is safe — subsequent calls are no-ops.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create context
    this._ctx = new AudioContext();

    // ── Signal chain ───────────────────────────────────────────────────────
    //
    //   reverbSend ──► convolver ──► wetGain ──┐
    //                                          ├──► masterGain ──► destination
    //   (instruments) ──────────► dryGain ────┘
    //
    // Instruments that want reverb split their signal: dry path goes to
    // dryGain, and a copy goes to reverbSend.

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = 1.0;
    this._masterGain.connect(this._ctx.destination);

    this.dryGain = this._ctx.createGain();
    this.dryGain.gain.value = 1.0;
    this.dryGain.connect(this._masterGain);

    this.wetGain = this._ctx.createGain();
    this.wetGain.gain.value = 0.3; // default: subtle reverb
    this.wetGain.connect(this._masterGain);

    this._reverbSend = this._ctx.createGain();
    this._reverbSend.gain.value = 1.0;

    this.convolver = this._ctx.createConvolver();
    this.convolver.buffer = this.createReverbIR(2.0, 3.0);
    this.convolver.normalize = false; // we normalise manually in the IR

    this._reverbSend.connect(this.convolver);
    this.convolver.connect(this.wetGain);

    // Resume context in case it was created in a suspended state.
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }

    this.initialized = true;
  }

  // ── Reverb impulse response ───────────────────────────────────────────────

  /**
   * Generates a stereo impulse response consisting of exponentially decaying
   * white noise.  This produces a convincing plate/room reverb tail without
   * requiring an external audio file.
   *
   * @param duration - Length of the IR in seconds (e.g. 2.0).
   * @param decay    - Exponential decay rate (higher = faster fade, e.g. 3.0).
   * @returns        A stereo AudioBuffer suitable for a ConvolverNode.
   */
  public createReverbIR(duration: number, decay: number): AudioBuffer {
    if (!this._ctx) {
      throw new Error('[CoreAudioEngine] AudioContext not created yet.');
    }
    const ctx = this._ctx;

    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const numChannels = 2;

    const buffer = ctx.createBuffer(numChannels, length, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // White noise sample in [-1, 1]
        const noise = Math.random() * 2 - 1;
        // Exponential envelope: starts at 1.0, decays to ~0 over `duration` s
        const envelope = Math.pow(1 - i / length, decay);
        channelData[i] = noise * envelope;
      }
    }

    return buffer;
  }

  // ── Public accessors ──────────────────────────────────────────────────────

  /**
   * Returns the raw AudioContext.
   * Throws if the engine has not been initialized yet.
   */
  public getContext(): AudioContext {
    this.assertInitialized();
    return this._ctx!;
  }

  public get audioContext(): AudioContext {
    return this.getContext();
  }

  public get context(): AudioContext {
    return this.getContext();
  }

  /**
   * Returns the master GainNode.
   * Instruments that do NOT use reverb should connect here directly.
   */
  public getMasterGain(): GainNode {
    this.assertInitialized();
    return this._masterGain!;
  }

  public get masterGain(): GainNode {
    return this.getMasterGain();
  }

  /**
   * Returns the reverb send bus.
   * Instruments that want reverb applied should connect a copy of their
   * output here in addition to the dry path.
   */
  public getReverbSend(): GainNode {
    this.assertInitialized();
    return this._reverbSend!;
  }

  public get reverbSend(): GainNode {
    return this.getReverbSend();
  }

  /**
   * Returns the AudioContext's current time in seconds.
   * Equivalent to AudioContext.currentTime.
   */
  public get currentTime(): number {
    this.assertInitialized();
    return this._ctx!.currentTime;
  }

  // ── Volume / mix controls ─────────────────────────────────────────────────

  /**
   * Sets the master output volume.
   * @param level - Linear gain value, clamped to [0, 1].
   */
  public setMasterVolume(level: number): void {
    this.assertInitialized();
    const clamped = Math.max(0, Math.min(1, level));
    this._masterGain!.gain.setTargetAtTime(clamped, this._ctx!.currentTime, 0.01);
  }

  /**
   * Sets the reverb wet/dry mix.
   * @param wet - 0 = fully dry, 1 = fully wet.  Clamped to [0, 1].
   *
   * Internally this sets:
   *   wetGain.gain = wet
   *   dryGain.gain = 1 - wet
   * so total perceived level stays roughly constant.
   */
  public setReverbMix(wet: number): void {
    this.assertInitialized();
    const w = Math.max(0, Math.min(1, wet));
    const now = this._ctx!.currentTime;
    this.wetGain!.gain.setTargetAtTime(w, now, 0.01);
    this.dryGain!.gain.setTargetAtTime(1 - w, now, 0.01);
  }

  // ── AudioContext lifecycle ────────────────────────────────────────────────

  /**
   * Suspends the AudioContext, pausing all audio processing.
   * Useful when the app tab is hidden.
   */
  public async suspend(): Promise<void> {
    if (this._ctx && this._ctx.state === 'running') {
      await this._ctx.suspend();
    }
  }

  /**
   * Resumes the AudioContext from a suspended state.
   */
  public async resume(): Promise<void> {
    if (this._ctx && this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  // ── Utility factories ─────────────────────────────────────────────────────

  /**
   * Creates and returns a GainNode attached to this AudioContext.
   * @param value - Initial gain value (default 1.0).
   */
  public createGain(value: number = 1.0): GainNode {
    this.assertInitialized();
    const gain = this._ctx!.createGain();
    gain.gain.value = value;
    return gain;
  }

  // ── Scheduler integration ─────────────────────────────────────────────────

  /**
   * Starts the lookahead scheduler Web Worker and registers a tick callback.
   *
   * The scheduler fires `onTick` approximately every 25 ms.  Inside `onTick`
   * the caller is responsible for querying `engine.currentTime` and
   * scheduling any beats that fall within the lookahead window.
   *
   * Calling startScheduler() while already running first stops the previous
   * worker before starting a new one.
   *
   * @param onTick - Callback invoked on every scheduler tick.
   * @param bpm    - Initial beats per minute.
   */
  public startScheduler(onTick: () => void, bpm: number): void {
    this.assertInitialized();

    // Stop any existing scheduler first.
    this.stopScheduler();

    this.tickCallback = onTick;
    this.schedulerWorker = new SchedulerWorkerCtor();

    this.schedulerWorker.onmessage = (event: MessageEvent<WorkerTickMessage>): void => {
      if (event.data.type === 'tick' && this.tickCallback) {
        this.tickCallback();
      }
    };

    this.schedulerWorker.onerror = (err: ErrorEvent): void => {
      console.error('[CoreAudioEngine] SchedulerWorker error:', err.message);
    };

    const startMsg: WorkerOutgoingMessage = {
      type: 'start',
      bpm,
      lookahead: 100, // ms — default lookahead window
    };
    this.schedulerWorker.postMessage(startMsg);
  }

  /**
   * Stops the lookahead scheduler and terminates the Web Worker.
   * Safe to call even if the scheduler was never started.
   */
  public stopScheduler(): void {
    if (this.schedulerWorker) {
      const stopMsg: WorkerOutgoingMessage = { type: 'stop' };
      this.schedulerWorker.postMessage(stopMsg);
      // Give the worker a brief moment to process the stop message,
      // then terminate it.
      setTimeout(() => {
        this.schedulerWorker?.terminate();
        this.schedulerWorker = null;
      }, 50);
    }
    this.tickCallback = null;
  }

  /**
   * Updates the BPM on the running scheduler worker.
   * Has no effect if the scheduler is not running.
   *
   * @param bpm - New beats per minute.
   */
  public setBpm(bpm: number): void {
    if (!this.schedulerWorker) return;
    const msg: WorkerOutgoingMessage = { type: 'setBpm', bpm };
    this.schedulerWorker.postMessage(msg);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Guards public methods that require an initialized AudioContext.
   * Throws a descriptive error if initialize() has not been called.
   */
  private assertInitialized(): void {
    if (!this.initialized || !this._ctx) {
      throw new Error(
        '[CoreAudioEngine] Engine not initialized. ' +
        'Call await engine.initialize() from a user-gesture handler first.',
      );
    }
  }
}
