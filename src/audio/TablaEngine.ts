import CoreAudioEngine from './CoreAudioEngine';
import taalsData from './constants/taals.json';

type BolName = 'dha' | 'dhin' | 'tin' | 'ta' | 'ge' | 'na' | 'ti' | 'ka' | 'ra' | 'kat' | 'dhi' | '-';

interface TaalDefinition {
  id: string;
  name: string;
  beats: number;
  bols: string[];
  variation?: string[];
  shuffle?: string[];
}

interface TaalsFile {
  taals: TaalDefinition[];
}

export default class TablaEngine {
  private engine: CoreAudioEngine;

  // ── State ─────────────────────────────────────────────────────────────────
  private _isPlaying = false;
  private _bpm = 120;
  private volume = 0.8;
  private style: 'basic' | 'variation' | 'shuffle' = 'basic';
  private taalId = '';
  private _currentBeat = 0;
  private bolSeq: string[] = [];
  private velSeq: number[] = [];
  private offSeq: number[] = [];
  private beatCount = 16;
  private readonly taalsMap = new Map<string, TaalDefinition & { velocities?: number[], offsets?: number[], variationVelocities?: number[], variationOffsets?: number[], shuffleVelocities?: number[], shuffleOffsets?: number[] }>();

  // ── Audio graph ───────────────────────────────────────────────────────────
  private outputGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loaded = false;

  public get isPlaying(): boolean {
    return this._isPlaying;
  }
  public get currentBeat(): number {
    return this._currentBeat;
  }

  constructor(engine: CoreAudioEngine) {
    this.engine = engine;

    this.outputGain = engine.audioContext.createGain();
    this.outputGain.gain.value = this.volume;
    this.outputGain.connect(engine.reverbSend);
    this.outputGain.connect(engine.masterGain);

    const data = taalsData as any;
    for (const t of data.taals) {
      this.taalsMap.set(t.id, t);
    }
    const first = data.taals[0];
    if (first) {
      this._loadTaal(first);
    }

    this._loadSamples();
  }

  private async _loadSamples() {
    const bols = ['dha', 'dhin', 'ta', 'na', 'tin', 'ti', 'ge', 'ka'];
    const ctx = this.engine.audioContext;
    
    try {
      const promises = bols.map(async (bol) => {
        const response = await fetch(`/audio/tabla/${bol}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(bol, audioBuffer);
      });
      await Promise.all(promises);
      this.loaded = true;
    } catch (err) {
      console.error('[TablaEngine] Failed to load samples:', err);
    }
  }

  public setTaal(taalId: string): void {
    const def = this.taalsMap.get(taalId);
    if (def) {
      this._loadTaal(def);
    }
  }

  public setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    const now = this.engine.audioContext.currentTime;
    this.outputGain.gain.setTargetAtTime(this.volume, now, 0.01);
  }

  public setBpm(bpm: number): void {
    this._bpm = Math.max(20, Math.min(400, bpm));
  }

  public setStyle(style: 'basic' | 'variation' | 'shuffle'): void {
    this.style = style;
    const def = this.taalsMap.get(this.taalId);
    if (def) {
      this._loadTaal(def);
    }
  }

  public start(): void {
    this._isPlaying = true;
    this._currentBeat = 0;
  }

  public stop(): void {
    this._isPlaying = false;
  }

  public scheduleBeats(fromTime: number, startBeat: number, numBeats: number): void {
    if (this.bolSeq.length === 0 || !this.loaded) return;
    const beatDuration = 60 / this._bpm;

    for (let i = 0; i < numBeats; i++) {
      const beatPos = (startBeat + i) % this.bolSeq.length;
      
      const offset = this.offSeq[beatPos] || 0;
      const bolTime = fromTime + (i + offset) * beatDuration;
      
      const bol = this.bolSeq[beatPos] ?? '-';
      const vel = this.velSeq[beatPos] ?? (beatPos === 0 ? 1.4 : 0.9);

      this.playBol(bol, bolTime, vel);
    }
    this._currentBeat = startBeat % this.bolSeq.length;
  }

  public playBol(bol: string, time: number, accent: boolean | number): void {
    const normalised = bol.trim().toLowerCase() as BolName;
    const gainMul = typeof accent === 'number' ? accent : (accent ? 1.4 : 0.9);

    switch (normalised) {
      case 'dhi':
      case 'dhin':
        this._playSample('dhin', time, gainMul);
        break;
      case 'kat':
        // Kat = Ka + Ti
        this._playSample('ka', time, gainMul * 0.9);
        this._playSample('ti', time + 0.003, gainMul * 1.0);
        break;
      case 'ra':
        // Ra = Ta .. Ta
        this._playSample('ta', time, gainMul * 0.8);
        this._playSample('ta', time + 0.035, gainMul * 0.6);
        break;
      case 'dha':
      case 'ge':
      case 'ka':
      case 'ta':
      case 'na':
      case 'tin':
      case 'ti':
        this._playSample(normalised, time, gainMul);
        break;
      case '-':
      default:
        break;
    }
  }

  private _playSample(bol: string, time: number, gainMul: number) {
    const buffer = this.buffers.get(bol);
    if (!buffer) return;

    const ctx = this.engine.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gainMul, time);
    
    source.connect(env);
    env.connect(this.outputGain);
    
    source.start(time);
  }

  private _loadTaal(def: any): void {
    this.taalId = def.id;
    this.beatCount = def.beats;
    
    switch (this.style) {
      case 'variation':
        this.bolSeq = def.variation ?? def.bols;
        this.velSeq = def.variationVelocities ?? def.velocities ?? [];
        this.offSeq = def.variationOffsets ?? def.offsets ?? [];
        break;
      case 'shuffle':
        this.bolSeq = def.shuffle ?? def.bols;
        this.velSeq = def.shuffleVelocities ?? def.velocities ?? [];
        this.offSeq = def.shuffleOffsets ?? def.offsets ?? [];
        break;
      case 'basic':
      default:
        this.bolSeq = def.bols;
        this.velSeq = def.velocities ?? [];
        this.offSeq = def.offsets ?? [];
        break;
    }
  }
}
