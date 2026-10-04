/**
 * AudioBridge.ts
 *
 * Orchestrates all audio engines in response to Zustand store changes.
 * This is the single connection point between UI state and audio.
 *
 * Usage:
 *   const bridge = AudioBridge.getInstance()
 *   await bridge.initialize()   // call on user gesture
 *   bridge.bindStore()          // subscribe to store changes
 */

import CoreAudioEngine from './CoreAudioEngine'
import TanpuraEngine from './TanpuraEngine'
import TablaEngine from './TablaEngine'
import AuxEngine from './AuxEngine'
import MicRecorder from './MicRecorder'
import {
  useTaalForgeStore,
  selectEffectiveVolume,
  type TaalForgeState,
} from '../store/taalForgeStore'
import raagsData from './constants/raags.json'

// ──────────────────────────────────────────────────────────────────
// Pitch detection helper
// ──────────────────────────────────────────────────────────────────

export function detectPitch(analyser: AnalyserNode, sampleRate: number): number | null {
  const bufferLength = analyser.fftSize
  const buffer = new Float32Array(bufferLength)
  analyser.getFloatTimeDomainData(buffer)

  // Auto-correlation pitch detection
  const SIZE = bufferLength
  const correlations = new Array(SIZE).fill(0)
  let rms = 0

  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i]
    rms += val * val
  }
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return null // Too quiet

  let r1 = 0, r2 = SIZE - 1
  const threshold = 0.2
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i
      break
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < threshold) {
      r2 = SIZE - i
      break
    }
  }

  const buf2 = buffer.slice(r1, r2)
  const c = new Array(buf2.length).fill(0)
  for (let i = 0; i < buf2.length; i++) {
    for (let j = 0; j < buf2.length - i; j++) {
      c[i] += buf2[j] * buf2[j + i]
    }
  }

  let d = 0
  while (c[d] > c[d + 1]) d++
  let maxval = -Infinity
  let maxpos = -1
  for (let i = d; i < buf2.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i]
      maxpos = i
    }
  }

  let T0 = maxpos
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  if (a) T0 -= b / (2 * a)

  return sampleRate / T0
}

// ──────────────────────────────────────────────────────────────────
// Scheduler logic — lookahead scheduling on main thread
// ──────────────────────────────────────────────────────────────────

const SCHEDULE_AHEAD_TIME = 0.1  // seconds to schedule ahead
const NOTE_RESOLUTION = 25       // ms between scheduler calls

// ──────────────────────────────────────────────────────────────────
// Bridge
// ──────────────────────────────────────────────────────────────────

export class AudioBridge {
  private static _instance: AudioBridge | null = null

  private engine: CoreAudioEngine
  private tanpura1: TanpuraEngine | null = null
  private tanpura2: TanpuraEngine | null = null
  private tabla: TablaEngine | null = null
  private aux: AuxEngine | null = null
  private mic: MicRecorder | null = null

  private pitchAnalyser: AnalyserNode | null = null

  // Scheduler state
  private scheduleInterval: ReturnType<typeof setInterval> | null = null
  private nextBeatTime: number = 0
  private currentBeat: number = 0
  private totalBeats: number = 16  // default teentaal

  // Unsubscribe functions
  private unsubscribers: Array<() => void> = []

  private constructor() {
    this.engine = CoreAudioEngine.getInstance()
  }

  static getInstance(): AudioBridge {
    if (!AudioBridge._instance) {
      AudioBridge._instance = new AudioBridge()
    }
    return AudioBridge._instance
  }

  // ──────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.engine.initialize()

    const ctx = this.engine.getContext()

    // Instantiate engines
    this.tanpura1 = new TanpuraEngine(this.engine, 1)
    this.tanpura2 = new TanpuraEngine(this.engine, 2)
    this.tabla = new TablaEngine(this.engine)
    this.aux = new AuxEngine(this.engine)
    this.mic = new MicRecorder(this.engine)

    // Pitch analyser for auto-detect
    this.pitchAnalyser = ctx.createAnalyser()
    this.pitchAnalyser.fftSize = 2048
    this.pitchAnalyser.smoothingTimeConstant = 0.8

    // Mark store as initialized
    useTaalForgeStore.getState().setInitialized(true)
  }

  // ──────────────────────────────────────────────
  // Store binding
  // ──────────────────────────────────────────────

  bindStore(): void {
    const store = useTaalForgeStore

    // Playing state
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.playing,
        (playing) => {
          if (playing) {
            this._startPlayback()
          } else {
            this._stopPlayback()
          }
        }
      )
    )

    // BPM
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.bpm,
        (bpm) => {
          this.engine.setBpm(bpm)
          if (this.tanpura1) this.tanpura1.setBpm(bpm)
          if (this.tanpura2) this.tanpura2.setBpm(bpm)
          if (this.tabla) this.tabla.setBpm(bpm)
        }
      )
    )

    // Taal
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.taalId,
        (taalId) => {
          if (this.tabla) this.tabla.setTaal(taalId)
          this.currentBeat = 0
        }
      )
    )

    // Root note
    this.unsubscribers.push(
      store.subscribe(
        (s) => ({ rootNote: s.rootNote, fineTuneCents: s.fineTuneCents }),
        ({ rootNote, fineTuneCents }) => {
          if (this.tanpura1) {
            this.tanpura1.setRootNote(rootNote)
            this.tanpura1.setFineTune(fineTuneCents)
          }
          if (this.tanpura2) {
            this.tanpura2.setRootNote(rootNote)
            this.tanpura2.setFineTune(fineTuneCents)
          }
          if (this.aux) {
            this.aux.updateSurPetiRoot(rootNote, fineTuneCents)
          }
        },
        { equalityFn: (a, b) => a.rootNote === b.rootNote && a.fineTuneCents === b.fineTuneCents }
      )
    )

    // Tanpura 1 active/string
    this.unsubscribers.push(
      store.subscribe(
        (s) => ({ active: s.tanpura1Active, mode: s.tanpura1String1Mode }),
        ({ active, mode }) => {
          if (!this.tanpura1) return
          this.tanpura1.setString1Mode(mode)
          if (active && !this.tanpura1.isPlaying) this.tanpura1.start()
          else if (!active && this.tanpura1.isPlaying) this.tanpura1.stop()
        },
        { equalityFn: (a, b) => a.active === b.active && a.mode === b.mode }
      )
    )

    // Tanpura 2 active/string
    this.unsubscribers.push(
      store.subscribe(
        (s) => ({ active: s.tanpura2Active, mode: s.tanpura2String1Mode }),
        ({ active, mode }) => {
          if (!this.tanpura2) return
          this.tanpura2.setString1Mode(mode)
          if (active && !this.tanpura2.isPlaying) this.tanpura2.start()
          else if (!active && this.tanpura2.isPlaying) this.tanpura2.stop()
        },
        { equalityFn: (a, b) => a.active === b.active && a.mode === b.mode }
      )
    )

    // Tabla active
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.tablaActive,
        (active) => {
          if (!this.tabla || !store.getState().playing) return
          if (active && !this.tabla.isPlaying) this.tabla.start()
          else if (!active) this.tabla.stop()
        }
      )
    )

    // Tabla style
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.tablaStyle,
        (style) => this.tabla?.setStyle(style)
      )
    )

    // Sur Peti
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.surPetiActive,
        (active) => {
          if (!this.aux) return
          const { rootNote, fineTuneCents } = store.getState()
          if (active) this.aux.startSurPeti(rootNote, fineTuneCents)
          else this.aux.stopSurPeti()
        }
      )
    )

    // Manjira
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.manjiraActive,
        (active) => {
          if (!this.aux) return
          const { taalId, bpm } = store.getState()
          if (active) this.aux.startManjira(taalId, bpm)
          else this.aux.stopManjira()
        }
      )
    )

    // Swar Mandal
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.swarMandalActive,
        (active) => {
          if (!this.aux) return
          const { raagId, rootNote } = store.getState()
          if (active) this.aux.startAutoSwarMandal(raagId, rootNote, 8000)
          else this.aux.stopSwarMandal()
        }
      )
    )

    // Mic
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.micActive,
        async (active) => {
          if (!this.mic) return
          if (active) {
            const granted = await this.mic.requestPermission()
            if (granted) {
              const { micReverbMix } = store.getState()
              await this.mic.start(micReverbMix)
            } else {
              store.getState().setMicActive(false)
            }
          } else {
            this.mic.stop()
          }
        }
      )
    )

    // Mixer volumes — subscribe to each channel
    const mixChannels = ['tanpura1', 'tanpura2', 'tabla', 'aux', 'mic', 'master'] as const
    for (const channel of mixChannels) {
      this.unsubscribers.push(
        store.subscribe(
          (s) => ({ vol: s.mix[channel].volume, muted: s.mix[channel].muted, solo: s.mix[channel].solo }),
          () => {
            const state = store.getState()
            this._applyMix(state)
          },
          { equalityFn: (a, b) => a.vol === b.vol && a.muted === b.muted && a.solo === b.solo }
        )
      )
    }

    // Reverb mix
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.reverbMix,
        (mix) => this.engine.setReverbMix(mix)
      )
    )

    // Initial sync for continuous background instruments (independent of 'playing' state)
    const state = store.getState()
    if (state.tanpura1Active && this.tanpura1) {
      this.tanpura1.setString1Mode(state.tanpura1String1Mode)
      this.tanpura1.start()
    }
    if (state.tanpura2Active && this.tanpura2) {
      this.tanpura2.setString1Mode(state.tanpura2String1Mode)
      this.tanpura2.start()
    }
    if (state.surPetiActive && this.aux) {
      this.aux.startSurPeti(state.rootNote, state.fineTuneCents)
    }
  }

  // ──────────────────────────────────────────────
  // Playback lifecycle
  // ──────────────────────────────────────────────

  private _startPlayback(): void {
    const state = useTaalForgeStore.getState()
    this.engine.resume()

    // Initialize beat timing
    this.nextBeatTime = this.engine.currentTime + 0.1
    this.currentBeat = 0

    // Load taal
    if (this.tabla) {
      this.tabla.setTaal(state.taalId)
      if (state.tablaActive) this.tabla.start()
    }

    // Start rhythmic aux instruments
    if (state.manjiraActive && this.aux) {
      this.aux.startManjira(state.taalId, state.bpm)
    }
    if (state.swarMandalActive && this.aux) {
      this.aux.startAutoSwarMandal(state.raagId, state.rootNote, 8000)
    }

    // Start Web Worker scheduler for beat clock
    this.engine.startScheduler(() => this._schedulerTick(), state.bpm)

    // Start practice timer
    state.startPracticeTimer()
  }

  private _stopPlayback(): void {
    this.engine.stopScheduler()

    if (this.tabla?.isPlaying) this.tabla.stop()

    if (this.aux) {
      this.aux.stopManjira()
      this.aux.stopSwarMandal()
    }

    useTaalForgeStore.getState().stopPracticeTimer()
    useTaalForgeStore.getState().setCurrentBeat(0)
  }

  // ──────────────────────────────────────────────
  // Scheduler tick — called from Web Worker
  // ──────────────────────────────────────────────

  private _schedulerTick(): void {
    const state = useTaalForgeStore.getState()
    const secondsPerBeat = 60.0 / state.bpm
    const currentTime = this.engine.currentTime

    while (this.nextBeatTime < currentTime + SCHEDULE_AHEAD_TIME) {
      // Schedule this beat
      this._scheduleOneBeat(this.currentBeat, this.nextBeatTime, state)

      // Update UI beat counter
      const beatForUI = this.currentBeat
      const beatTime = this.nextBeatTime
      setTimeout(() => {
        if (Math.abs(this.engine.currentTime - beatTime) < secondsPerBeat * 1.5) {
          useTaalForgeStore.getState().setCurrentBeat(beatForUI)
        }
      }, Math.max(0, (beatTime - currentTime) * 1000))

      // Advance
      this.nextBeatTime += secondsPerBeat
      this.currentBeat = (this.currentBeat + 1) % (this.totalBeats || 16)
    }
  }

  private _scheduleOneBeat(beat: number, time: number, state: TaalForgeState): void {
    // Tabla scheduling is handled internally by TablaEngine
    if (this.tabla && state.tablaActive) {
      this.tabla.scheduleBeats(time, beat, 1)
    }

    // Tanpura pluck scheduling
    if (this.tanpura1 && state.tanpura1Active) {
      this.tanpura1.schedulePlucks(time, 1)
    }
    if (this.tanpura2 && state.tanpura2Active) {
      this.tanpura2.schedulePlucks(time, 1)
    }
  }

  // ──────────────────────────────────────────────
  // Mix application
  // ──────────────────────────────────────────────

  private _applyMix(state: TaalForgeState): void {
    const eff = (ch: keyof TaalForgeState['mix']) =>
      selectEffectiveVolume(state, ch)

    if (this.tanpura1) this.tanpura1.setVolume(eff('tanpura1'))
    if (this.tanpura2) this.tanpura2.setVolume(eff('tanpura2'))
    if (this.tabla) this.tabla.setVolume(eff('tabla'))
    if (this.aux) {
      const auxVol = eff('aux')
      this.aux.setManjiraVolume(auxVol)
      this.aux.setSurPetiVolume(auxVol)
      this.aux.setSwarMandalVolume(auxVol)
    }
    if (this.mic) this.mic.setMicGain(eff('mic'))
    this.engine.setMasterVolume(eff('master'))
  }

  // ──────────────────────────────────────────────
  // Pitch detection
  // ──────────────────────────────────────────────

  async detectPitchFromMic(): Promise<number | null> {
    if (!this.pitchAnalyser) return null
    return detectPitch(this.pitchAnalyser, this.engine.getContext().sampleRate)
  }

  // ──────────────────────────────────────────────
  // Recording
  // ──────────────────────────────────────────────

  startRecording(): void {
    this.mic?.startRecording()
  }

  async stopRecording(): Promise<Blob | null> {
    return this.mic?.stopRecording() ?? null
  }

  downloadRecording(blob: Blob): void {
    this.mic?.downloadRecording(blob)
  }

  // ──────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────

  destroy(): void {
    this._stopPlayback()
    for (const unsub of this.unsubscribers) unsub()
    this.unsubscribers = []
  }

  get micRecorder(): MicRecorder | null {
    return this.mic
  }
}

export default AudioBridge
