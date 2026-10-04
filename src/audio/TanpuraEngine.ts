import CoreAudioEngine from './CoreAudioEngine';

type String1Mode = 'Pa' | 'Ma' | 'Ni';

const NOTE_FILE: Record<number, string> = {
  0: 'C', 1: 'Ccis', 2: 'D', 3: 'Dcis', 4: 'E', 5: 'F',
  6: 'Fcis', 7: 'G', 8: 'Gcis', 9: 'A', 10: 'Acis', 11: 'B'
};

export default class TanpuraEngine {
  private engine: CoreAudioEngine;
  private channel: 1 | 2;
  
  private _isPlaying = false;
  public get isPlaying() { return this._isPlaying; }
  private rootMidi = 60; // C4
  private fineTuneCents = 0;
  private string1Mode: String1Mode = 'Pa';
  private volume = 0.5;

  private outputGain: GainNode;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBufferName = '';
  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer>>();

  constructor(engine: CoreAudioEngine, channel: 1 | 2) {
    this.engine = engine;
    this.channel = channel;

    this.outputGain = engine.audioContext.createGain();
    this.outputGain.gain.value = this.volume;
    
    // Tanpura benefits from reverb for depth
    this.outputGain.connect(engine.reverbSend);
    this.outputGain.connect(engine.masterGain);
    
    // Preload the default C pitch
    this._preloadAndPlayIfActive();
  }

  // -------------------------------------------------------------------------
  // Public configuration API
  // -------------------------------------------------------------------------

  public setRootNote(midiNote: number): void {
    this.rootMidi = midiNote;
    this._preloadAndPlayIfActive();
  }

  public setFineTune(cents: number): void {
    this.fineTuneCents = Math.max(-50, Math.min(50, cents));
    this._updatePlaybackRate();
  }

  private _updatePlaybackRate(): void {
    if (!this.sourceNode) return;
    
    // drshika samples are inherently recorded at Octave 3 (e.g. C3 = MIDI 48).
    // Math.floor(rootMidi / 12) - 1 gets the target octave number.
    const targetOctave = Math.floor(this.rootMidi / 12) - 1;
    const nativeOctave = 3;
    const octaveDiff = targetOctave - nativeOctave;
    
    // 1 octave = 1200 cents
    const totalCents = (octaveDiff * 1200) + this.fineTuneCents;
    const rate = Math.pow(2, totalCents / 1200);
    
    this.sourceNode.playbackRate.setTargetAtTime(rate, this.engine.audioContext.currentTime, 0.05);
  }

  public setString1Mode(mode: String1Mode): void {
    this.string1Mode = mode;
    // drshika only provides one set of loops (mostly Pa tuned). 
    // We update fine-tuning/pitch but don't have separate files for Ma.
    this._preloadAndPlayIfActive();
  }

  public setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    this.outputGain.gain.setTargetAtTime(
      this.volume,
      this.engine.audioContext.currentTime,
      0.05,
    );
  }

  public setBpm(bpm: number): void {
    // These pre-recorded drones have a fixed tempo/pluck rate. 
    // We ignore BPM to preserve the acoustic integrity.
  }

  // -------------------------------------------------------------------------
  // Playback control
  // -------------------------------------------------------------------------

  public start(): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._preloadAndPlayIfActive();
  }

  public stop(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    this._stopCurrentSource(1.0); // 1 second fadeout
  }

  public schedulePlucks(fromTime: number, beats: number): void {
    // This is no longer needed since we are using a continuous audio loop
    // instead of an internal synthesizer step-scheduler.
  }

  // -------------------------------------------------------------------------
  // Private: Streaming Logic
  // -------------------------------------------------------------------------

  private _getFilenameForState(): string {
    const noteIdx = this.rootMidi % 12;
    return NOTE_FILE[noteIdx];
  }

  private async _preloadAndPlayIfActive() {
    const filename = this._getFilenameForState();
    if (this.currentBufferName === filename && this.sourceNode) {
      // Already playing correct file, just update fine tune
      this.setFineTune(this.fineTuneCents);
      return;
    }

    try {
      const buffer = await this._loadBuffer(filename);
      
      // If state changed while loading or we stopped, abort playback
      if (this._getFilenameForState() !== filename || !this._isPlaying) return;

      this.currentBufferName = filename;
      this._playBuffer(buffer);
      this.setFineTune(this.fineTuneCents);

    } catch (err) {
      console.error(`[TanpuraEngine] Failed to load ${filename}.mp3`, err);
    }
  }

  private _loadBuffer(filename: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(filename)) {
      return Promise.resolve(this.bufferCache.get(filename)!);
    }
    if (this.loadingPromises.has(filename)) {
      return this.loadingPromises.get(filename)!;
    }

    const ctx = this.engine.audioContext;
    const promise = fetch(`/audio/tanpura_drshika/${filename}.mp3`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(arr => ctx.decodeAudioData(arr))
      .then(buffer => {
        this.bufferCache.set(filename, buffer);
        this.loadingPromises.delete(filename);
        return buffer;
      })
      .catch(err => {
        this.loadingPromises.delete(filename);
        throw err;
      });

    this.loadingPromises.set(filename, promise);
    return promise;
  }

  private _playBuffer(buffer: AudioBuffer) {
    const ctx = this.engine.audioContext;
    
    // Fade out old source smoothly
    this._stopCurrentSource(0.5);

    // Create new source
    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.loop = true;

    // Small local gain for crossfading
    const fadeGain = ctx.createGain();
    fadeGain.gain.value = 0;
    fadeGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.5);

    this.sourceNode.connect(fadeGain);
    fadeGain.connect(this.outputGain);

    this.sourceNode.start(0);

    // Patch the fadeGain to the node so we can fade it out later
    (this.sourceNode as any)._fadeGain = fadeGain;
  }

  private _stopCurrentSource(fadeDuration: number) {
    if (!this.sourceNode) return;
    
    const source = this.sourceNode;
    const fadeGain = (source as any)._fadeGain as GainNode;
    
    if (fadeGain) {
      const now = this.engine.audioContext.currentTime;
      fadeGain.gain.cancelScheduledValues(now);
      fadeGain.gain.setValueAtTime(fadeGain.gain.value, now);
      fadeGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
      source.stop(now + fadeDuration);
    } else {
      source.stop(0);
    }

    this.sourceNode = null;
    this.currentBufferName = '';
  }
}
