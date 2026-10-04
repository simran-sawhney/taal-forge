/**
 * AuxEngine.ts
 *
 * Synthesizes auxiliary instruments for TaalForge:
 *   • Manjira   — metallic cymbal/bell strikes scheduled on Tali beats
 *   • Sur Peti  — continuous harmonium-style Sa+Pa drone with vibrato
 *   • Swar Mandal — harp glissando across the active raag scale
 *
 * All synthesis is done via the Web Audio API directly. No external
 * audio libraries are used. Scheduling uses the CoreAudioEngine's
 * AudioContext so that all instruments share a single clock.
 */

import raagsData from './constants/raags.json';
import taalsData from './constants/taals.json';

// ---------------------------------------------------------------------------
// Minimal interface for the CoreAudioEngine dependency
// ---------------------------------------------------------------------------

/**
 * Minimal surface of CoreAudioEngine that AuxEngine depends on.
 * Import and use the real CoreAudioEngine type in production;
 * this interface prevents a circular import and keeps AuxEngine testable.
 */
export interface CoreAudioEngine {
  /** The shared AudioContext used by all engines. */
  readonly context: AudioContext;
  /** Master output gain node (or any node suitable as a mix bus). */
  readonly masterGain: GainNode;
}

// ---------------------------------------------------------------------------
// Internal data shapes
// ---------------------------------------------------------------------------

interface RaagEntry {
  id: string;
  name: string;
  semitones: number[];
  [key: string]: unknown;
}

interface ManjiraState {
  /** setInterval handle for the scheduler heartbeat. */
  intervalHandle: ReturnType<typeof setInterval> | null;
  /** Tracks the next beat number we need to schedule. */
  nextBeatIndex: number;
  /** Wall-clock time (AudioContext.currentTime) of the next scheduled note. */
  nextNoteTime: number;
  taalId: string;
  bpm: number;
}

interface SurPetiState {
  saOsc: OscillatorNode | null;
  paOsc: OscillatorNode | null;
  saLfo: OscillatorNode | null;
  paLfo: OscillatorNode | null;
  filter: BiquadFilterNode | null;
  gainNode: GainNode | null;
  active: boolean;
}

interface SwarMandalState {
  /** setInterval handle for the auto-strum scheduler. */
  intervalHandle: ReturnType<typeof setInterval> | null;
  raagId: string;
  rootMidi: number;
  ascending: boolean;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Convert a MIDI note number to its fundamental frequency in Hz.
 * A4 (MIDI 69) = 440 Hz.
 */
function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Apply a fine-tune offset in cents to a frequency in Hz.
 */
function applyFineTune(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

/**
 * Look up a raag by id. Returns undefined when not found.
 */
function findRaag(raagId: string): RaagEntry | undefined {
  return (raagsData.raags as RaagEntry[]).find((r) => r.id === raagId);
}

// ---------------------------------------------------------------------------
// Lookahead scheduler constants
// ---------------------------------------------------------------------------

/** How far ahead (in seconds) we schedule notes. */
const SCHEDULE_AHEAD_TIME = 0.1;

/** How often (in ms) the scheduler heartbeat runs. */
const SCHEDULER_INTERVAL_MS = 25;

// ---------------------------------------------------------------------------
// AuxEngine
// ---------------------------------------------------------------------------

export class AuxEngine {
  // ---- shared references --------------------------------------------------
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;

  // ---- per-instrument gain buses ------------------------------------------
  private readonly manjiraGain: GainNode;
  private readonly surPetiGain: GainNode;
  private readonly swarMandalGain: GainNode;

  // ---- reverb send (simple convolver reverb via feedback delay) -----------
  private readonly reverbSend: GainNode;
  private readonly reverbReturn: GainNode;
  private readonly reverbDelay: DelayNode;
  private readonly reverbFeedback: GainNode;

  // ---- instrument state ---------------------------------------------------
  private manjira: ManjiraState = {
    intervalHandle: null,
    nextBeatIndex: 0,
    nextNoteTime: 0,
    taalId: 'teentaal',
    bpm: 60,
  };

  private surPeti: SurPetiState = {
    saOsc: null,
    paOsc: null,
    saLfo: null,
    paLfo: null,
    filter: null,
    gainNode: null,
    active: false,
  };

  private swarMandal: SwarMandalState = {
    intervalHandle: null,
    raagId: 'yaman',
    rootMidi: 60,
    ascending: true,
  };

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(engine: CoreAudioEngine) {
    this.ctx = engine.context;
    this.masterGain = engine.masterGain;

    // ---- Reverb chain (Schroeder-style single delay feedback) -------------
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.18;

    this.reverbDelay = this.ctx.createDelay(2.0);
    this.reverbDelay.delayTime.value = 0.06;

    this.reverbFeedback = this.ctx.createGain();
    this.reverbFeedback.gain.value = 0.45;

    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.5;

    // Delay feedback loop
    this.reverbDelay.connect(this.reverbFeedback);
    this.reverbFeedback.connect(this.reverbDelay);
    this.reverbDelay.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterGain);

    // ---- Per-instrument gain buses ----------------------------------------
    this.manjiraGain = this.ctx.createGain();
    this.manjiraGain.gain.value = 0.7;
    this.manjiraGain.connect(this.masterGain);

    this.surPetiGain = this.ctx.createGain();
    this.surPetiGain.gain.value = 0.5;
    this.surPetiGain.connect(this.masterGain);

    this.swarMandalGain = this.ctx.createGain();
    this.swarMandalGain.gain.value = 0.6;
    this.swarMandalGain.connect(this.masterGain);
  }

  // =========================================================================
  // MANJIRA — Metallic cymbal / bell strikes
  // =========================================================================

  /**
   * Synthesize a single metallic Manjira (cymbal/bell) strike at the given
   * AudioContext time.
   *
   * Signal path:
   *   [Osc 4000 Hz square] \
   *                         +--> [BiquadFilter BP 3500 Hz Q=8]
   *   [Osc 4877 Hz square] /        |           |
   *                               [dry]    [reverbSend]
   *                                 |
   *                           [manjiraGain]
   *                                 |
   *                           [masterGain]
   */
  playManjira(time: number): void {
    const ctx = this.ctx;

    // ---- Envelope gain node ------------------------------------------------
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0, time);
    // Attack
    envGain.gain.linearRampToValueAtTime(1.0, time + 0.002);
    // Decay to sustain
    envGain.gain.exponentialRampToValueAtTime(0.15, time + 0.002 + 0.15);
    // Release
    envGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.002 + 0.15 + 0.08);

    // ---- Bandpass filter ---------------------------------------------------
    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.value = 3500;
    bpFilter.Q.value = 8;

    // ---- Oscillator 1 — fundamental ~4000 Hz -------------------------------
    const osc1 = ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = 4000;

    // ---- Oscillator 2 — golden-ratio partial ~4877 Hz ----------------------
    // 4000 × φ ≈ 4000 × 1.61803 ≈ 6472; use 4000 × (φ - 0.38) ≈ 4877
    // This is the inharmonic partial that gives cymbals their metallic sheen.
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 4877;

    // ---- Mixer gain for osc2 (slightly quieter) ----------------------------
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.6;

    // ---- Connect signal graph ----------------------------------------------
    osc1.connect(bpFilter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(bpFilter);
    bpFilter.connect(envGain);

    // Dry path → instrument bus
    envGain.connect(this.manjiraGain);

    // Wet path → reverb send
    const reverbSendLocal = ctx.createGain();
    reverbSendLocal.gain.value = 0.25;
    envGain.connect(reverbSendLocal);
    reverbSendLocal.connect(this.reverbSend);
    this.reverbSend.connect(this.reverbDelay);

    // ---- Schedule start and stop ------------------------------------------
    const stopTime = time + 0.002 + 0.15 + 0.08 + 0.02;
    osc1.start(time);
    osc2.start(time);
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    // Clean up after playback
    osc1.onended = () => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        osc2Gain.disconnect();
        bpFilter.disconnect();
        envGain.disconnect();
        reverbSendLocal.disconnect();
      } catch {
        // Already disconnected — safe to ignore
      }
    };
  }

  /**
   * Start scheduling Manjira strikes on every Tali (clap) beat of the
   * specified taal. Uses a lookahead scheduler so timing is drift-free.
   *
   * @param taalId - Identifier of the taal (e.g. 'teentaal')
   * @param bpm    - Beats per minute for the taal cycle
   */
  startManjira(taalId: string, bpm: number): void {
    this.stopManjira();

    this.manjira.taalId = taalId;
    this.manjira.bpm = bpm;
    this.manjira.nextBeatIndex = 0;
    this.manjira.nextNoteTime = this.ctx.currentTime + 0.05;

    this.manjira.intervalHandle = setInterval(
      () => this._scheduleManjiraHeartbeat(),
      SCHEDULER_INTERVAL_MS,
    );
  }

  /** Stop the Manjira scheduler. Any already-scheduled notes will still play. */
  stopManjira(): void {
    if (this.manjira.intervalHandle !== null) {
      clearInterval(this.manjira.intervalHandle);
      this.manjira.intervalHandle = null;
    }
    this.manjira.nextBeatIndex = 0;
  }

  /** Set the output level of the Manjira instrument bus (0–1). */
  setManjiraVolume(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.manjiraGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
  }

  /**
   * Manually schedule Manjira strikes for a window of beats.
   * Useful when driving AuxEngine from an external scheduler.
   *
   * @param fromTime    - AudioContext time at which `startBeat` begins
   * @param startBeat   - First beat index (0-based) inside the taal cycle
   * @param beats       - Number of beats to schedule
   * @param taalBeats   - Total beats in the taal cycle
   * @param taliPoints  - Array of beat indices that are Tali (clap) points
   */
  scheduleManjira(
    fromTime: number,
    startBeat: number,
    beats: number,
    taalBeats: number,
    taliPoints: number[],
  ): void {
    const beatDuration = 60 / this.manjira.bpm;

    for (let i = 0; i < beats; i++) {
      const beatIndex = (startBeat + i) % taalBeats;
      if (taliPoints.includes(beatIndex)) {
        const strikeTime = fromTime + i * beatDuration;
        this.playManjira(strikeTime);
      }
    }
  }

  // ---- Private: lookahead heartbeat for Manjira ---------------------------

  private _scheduleManjiraHeartbeat(): void {
    const { taalId, bpm } = this.manjira;
    const beatDuration = 60 / bpm;

    // Lazily look up tali points for the current taal
    // Import taals.json inline to keep AuxEngine self-contained
    const taalData = this._getTaalData(taalId);
    const taliPoints: number[] = taalData?.tali ?? [0];
    const taalBeats: number = taalData?.beats ?? 16;

    const scheduleUntil = this.ctx.currentTime + SCHEDULE_AHEAD_TIME;

    while (this.manjira.nextNoteTime < scheduleUntil) {
      const beatIndex = this.manjira.nextBeatIndex % taalBeats;

      if (taliPoints.includes(beatIndex)) {
        this.playManjira(this.manjira.nextNoteTime);
      }

      this.manjira.nextNoteTime += beatDuration;
      this.manjira.nextBeatIndex++;
    }
  }

  /** Inline taal lookup to avoid importing taals.json at module level. */
  private _getTaalData(
    taalId: string,
  ): { beats: number; tali: number[] } | undefined {
    return taalsData.taals.find((t: any) => t.id === taalId);
  }

  // =========================================================================
  // SUR PETI — Harmonium-style Sa + Pa drone
  // =========================================================================

  /**
   * Start a continuous harmonium-style drone on Sa (root) and Pa (P5).
   *
   * Signal path:
   *   [Osc Sa — sawtooth] \
   *                        +--> [LowpassFilter 800 Hz] --> [surPetiGain] --> [masterGain]
   *   [Osc Pa — sawtooth] /
   *
   *   [LFO 0.5 Hz] --(±2 cents vibrato depth)--> Sa freq, Pa freq
   *
   * @param rootMidi      - MIDI note for Sa (e.g. 60 = middle C)
   * @param fineTuneCents - Fine-tune offset in cents applied to both notes
   */
  startSurPeti(rootMidi: number, fineTuneCents: number = 0): void {
    // Stop any existing drone first
    this.stopSurPeti();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Frequencies for Sa and Pa
    const saHz = applyFineTune(midiToHz(rootMidi), fineTuneCents);
    const paHz = applyFineTune(midiToHz(rootMidi + 7), fineTuneCents);

    // ---- Lowpass filter for harmonium timbre --------------------------------
    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 800;
    lpFilter.Q.value = 1.0;

    // ---- Drone gain node (starts at 0 for fade-in) -------------------------
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(1.0, now + 0.5);

    // ---- Sa oscillator ------------------------------------------------------
    const saOsc = ctx.createOscillator();
    saOsc.type = 'sawtooth';
    saOsc.frequency.value = saHz;

    // ---- Pa oscillator (perfect fifth = +7 semitones) ----------------------
    const paOsc = ctx.createOscillator();
    paOsc.type = 'sawtooth';
    paOsc.frequency.value = paHz;

    // Pa is slightly quieter than Sa in a harmonium voicing
    const paGain = ctx.createGain();
    paGain.gain.value = 0.75;

    // ---- LFO for vibrato (±2 cents at 0.5 Hz) ------------------------------
    // ±2 cents deviation: Δf = f × (2^(2/1200) - 1) ≈ f × 0.001156
    const saLfo = ctx.createOscillator();
    saLfo.type = 'sine';
    saLfo.frequency.value = 0.5;

    const saLfoGain = ctx.createGain();
    saLfoGain.gain.value = saHz * 0.001156; // ≈ ±2 cents depth for Sa

    const paLfo = ctx.createOscillator();
    paLfo.type = 'sine';
    paLfo.frequency.value = 0.5;
    // Slight phase offset so vibrato isn't perfectly locked between Sa & Pa
    paLfo.detune.value = 15;

    const paLfoGain = ctx.createGain();
    paLfoGain.gain.value = paHz * 0.001156; // ≈ ±2 cents depth for Pa

    // ---- Connect signal graph -----------------------------------------------
    saOsc.connect(lpFilter);
    paOsc.connect(paGain);
    paGain.connect(lpFilter);
    lpFilter.connect(droneGain);
    droneGain.connect(this.surPetiGain);
    this.surPetiGain.connect(this.masterGain);

    // LFO → frequency modulation
    saLfo.connect(saLfoGain);
    saLfoGain.connect(saOsc.frequency);
    paLfo.connect(paLfoGain);
    paLfoGain.connect(paOsc.frequency);

    // ---- Start oscillators --------------------------------------------------
    saOsc.start(now);
    paOsc.start(now);
    saLfo.start(now);
    paLfo.start(now);

    // ---- Persist state for later control ------------------------------------
    this.surPeti = {
      saOsc,
      paOsc,
      saLfo,
      paLfo,
      filter: lpFilter,
      gainNode: droneGain,
      active: true,
    };
  }

  /**
   * Fade out and stop the Sur Peti drone over 1 second.
   */
  stopSurPeti(): void {
    if (!this.surPeti.active) return;
    const { saOsc, paOsc, saLfo, paLfo, gainNode } = this.surPeti;
    const now = this.ctx.currentTime;

    // Fade out
    if (gainNode) {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
    }

    // Schedule stop after fade
    const stopTime = now + 1.05;
    saOsc?.stop(stopTime);
    paOsc?.stop(stopTime);
    saLfo?.stop(stopTime);
    paLfo?.stop(stopTime);

    // Cleanup references after fade
    const cleanup = () => {
      try {
        saOsc?.disconnect();
        paOsc?.disconnect();
        saLfo?.disconnect();
        paLfo?.disconnect();
        gainNode?.disconnect();
      } catch {
        // Safe to ignore
      }
    };

    if (saOsc) {
      saOsc.onended = cleanup;
    } else {
      cleanup();
    }

    this.surPeti = {
      saOsc: null,
      paOsc: null,
      saLfo: null,
      paLfo: null,
      filter: null,
      gainNode: null,
      active: false,
    };
  }

  /** Set Sur Peti output level (0–1). */
  setSurPetiVolume(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.surPetiGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
  }

  /**
   * Update the Sur Peti root note while the drone is playing.
   * Cross-fades smoothly to the new frequencies.
   *
   * @param rootMidi      - New MIDI root note
   * @param fineTuneCents - Fine-tune offset in cents
   */
  updateSurPetiRoot(rootMidi: number, fineTuneCents: number = 0): void {
    if (!this.surPeti.active) {
      // If not active, just start fresh
      this.startSurPeti(rootMidi, fineTuneCents);
      return;
    }

    const now = this.ctx.currentTime;
    const saHz = applyFineTune(midiToHz(rootMidi), fineTuneCents);
    const paHz = applyFineTune(midiToHz(rootMidi + 7), fineTuneCents);
    const glideTime = 0.3;

    const { saOsc, paOsc, saLfo, paLfo } = this.surPeti;

    if (saOsc) {
      saOsc.frequency.linearRampToValueAtTime(saHz, now + glideTime);
    }
    if (paOsc) {
      paOsc.frequency.linearRampToValueAtTime(paHz, now + glideTime);
    }

    // Update LFO depths to match new frequencies
    // (We'd need to store LFO gain nodes to update them; for simplicity
    //  we re-create the drone with cross-fade when root changes significantly.)
    if (saLfo && paLfo) {
      // LFO rate stays the same; depth change requires stored gain node refs.
      // Restart the drone cleanly after a brief cross-fade.
      this.stopSurPeti();
      setTimeout(() => {
        this.startSurPeti(rootMidi, fineTuneCents);
      }, 400);
    }
  }

  // =========================================================================
  // SWAR MANDAL — Harp glissando across the active raag scale
  // =========================================================================

  /**
   * Play a single glissando sweep across the raag scale.
   *
   * For each note in the scale we spawn:
   *   • A primary sine oscillator at the note's frequency
   *   • A chorus copy detuned +7 cents at lower amplitude
   *
   * Notes are staggered 40 ms apart; each note lasts ~200 ms with
   * a fast exponential decay (shimmer + quick release).
   *
   * @param raagSemitones - Array of semitone offsets from root (e.g. [0,2,4,5,7,9,11])
   * @param rootMidi      - MIDI note number for Sa (root)
   * @param time          - AudioContext time at which the glissando begins
   * @param ascending     - true = low→high, false = high→low
   */
  playSwarMandal(
    raagSemitones: number[],
    rootMidi: number,
    time: number,
    ascending: boolean = true,
  ): void {
    if (raagSemitones.length === 0) return;

    // Build a 1.5-octave note list: octave below + one full octave + partial 2nd
    // Start from rootMidi - 12 (one octave below) and walk up through ~13 notes
    const noteList: number[] = [];

    // Sub-octave pass (rootMidi - 12)
    for (const st of raagSemitones) {
      noteList.push(rootMidi - 12 + st);
    }
    // Main octave (rootMidi)
    for (const st of raagSemitones) {
      noteList.push(rootMidi + st);
    }
    // Clamp to ~13 notes total (1.5 octaves)
    const truncated = noteList.slice(0, 13);

    // Reverse for descending glissando
    const notes = ascending ? truncated : [...truncated].reverse();

    const NOTE_STRIDE_S = 0.04; // 40 ms between consecutive notes
    const NOTE_DURATION_S = 0.2; // total envelope duration per note

    notes.forEach((midi, idx) => {
      const noteTime = time + idx * NOTE_STRIDE_S;
      const freq = midiToHz(midi);
      this._playSwarMandalNote(freq, noteTime, NOTE_DURATION_S);
    });
  }

  /**
   * Start an automatic Swar Mandal that plays a glissando every `intervalMs`
   * milliseconds. Alternates ascending/descending for variety.
   *
   * @param raagId     - Raag identifier (looked up from raags.json)
   * @param rootMidi   - MIDI note for Sa
   * @param intervalMs - Time between glissandos in milliseconds
   */
  startAutoSwarMandal(raagId: string, rootMidi: number, intervalMs: number): void {
    this.stopSwarMandal();

    this.swarMandal.raagId = raagId;
    this.swarMandal.rootMidi = rootMidi;
    this.swarMandal.ascending = true;

    // Play immediately, then at each interval
    this._triggerAutoSwarMandal();

    this.swarMandal.intervalHandle = setInterval(() => {
      this._triggerAutoSwarMandal();
    }, intervalMs);
  }

  /** Stop the automatic Swar Mandal scheduler. In-flight notes complete naturally. */
  stopSwarMandal(): void {
    if (this.swarMandal.intervalHandle !== null) {
      clearInterval(this.swarMandal.intervalHandle);
      this.swarMandal.intervalHandle = null;
    }
  }

  /** Set Swar Mandal output level (0–1). */
  setSwarMandalVolume(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.swarMandalGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
  }

  // ---- Private: single Swar Mandal note -----------------------------------

  /**
   * Synthesize a single harp note at `freq` Hz starting at `startTime`.
   *
   * Signal path:
   *   [Osc primary — sine] \
   *                         +--> [envGain] --> [swarMandalGain] --> [masterGain]
   *   [Osc chorus  — sine] /
   *      (detuned +7 cents, gain 0.35)
   */
  private _playSwarMandalNote(freq: number, startTime: number, duration: number): void {
    const ctx = this.ctx;

    // ---- Envelope ----------------------------------------------------------
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0, startTime);
    // Very fast attack (3 ms pluck transient)
    envGain.gain.linearRampToValueAtTime(0.8, startTime + 0.003);
    // Exponential decay over the rest of the duration — typical harp resonance
    envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    // ---- Primary oscillator ------------------------------------------------
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // ---- Chorus oscillator — +7 cents shimmer effect -----------------------
    const chorusOsc = ctx.createOscillator();
    chorusOsc.type = 'sine';
    chorusOsc.frequency.value = applyFineTune(freq, 7);

    const chorusGain = ctx.createGain();
    chorusGain.gain.value = 0.35;

    // ---- Connect -----------------------------------------------------------
    osc.connect(envGain);
    chorusOsc.connect(chorusGain);
    chorusGain.connect(envGain);
    envGain.connect(this.swarMandalGain);

    // ---- Schedule ----------------------------------------------------------
    const stopTime = startTime + duration + 0.01;
    osc.start(startTime);
    chorusOsc.start(startTime);
    osc.stop(stopTime);
    chorusOsc.stop(stopTime);

    osc.onended = () => {
      try {
        osc.disconnect();
        chorusOsc.disconnect();
        chorusGain.disconnect();
        envGain.disconnect();
      } catch {
        // Safe to ignore
      }
    };
  }

  // ---- Private: trigger one auto-strum glissando --------------------------

  private _triggerAutoSwarMandal(): void {
    const raag = findRaag(this.swarMandal.raagId);
    if (!raag) {
      console.warn(`[AuxEngine] Raag '${this.swarMandal.raagId}' not found in raags.json`);
      return;
    }

    const now = this.ctx.currentTime + 0.02; // small scheduling offset
    this.playSwarMandal(
      raag.semitones,
      this.swarMandal.rootMidi,
      now,
      this.swarMandal.ascending,
    );

    // Alternate direction for the next trigger
    this.swarMandal.ascending = !this.swarMandal.ascending;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Stop all active instruments and release audio resources.
   * Call this when the engine is being torn down.
   */
  dispose(): void {
    this.stopManjira();
    this.stopSurPeti();
    this.stopSwarMandal();

    try {
      this.manjiraGain.disconnect();
      this.surPetiGain.disconnect();
      this.swarMandalGain.disconnect();
      this.reverbSend.disconnect();
      this.reverbDelay.disconnect();
      this.reverbFeedback.disconnect();
      this.reverbReturn.disconnect();
    } catch {
      // Safe to ignore
    }
  }
}

export default AuxEngine;
