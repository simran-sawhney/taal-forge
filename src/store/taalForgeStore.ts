import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type StringMode = 'Pa' | 'Ma' | 'Ni'
export type TablaStyle = 'basic' | 'variation' | 'shuffle'

export interface ChannelMix {
  volume: number   // 0–1
  muted: boolean
  solo: boolean
}

export interface TaalForgeState {
  // ── Engine lifecycle ─────────────────────────
  initialized: boolean
  playing: boolean

  // ── Tuning ────────────────────────────────────
  rootNote: number        // MIDI note (60 = C4)
  fineTuneCents: number   // -50 to +50

  // ── Rhythm ────────────────────────────────────
  taalId: string
  bpm: number
  tablaStyle: TablaStyle
  currentBeat: number     // 0-indexed within taal cycle

  // ── Raag ─────────────────────────────────────
  raagId: string

  // ── Tanpura ──────────────────────────────────
  tanpura1Active: boolean
  tanpura2Active: boolean
  tanpura1String1Mode: StringMode
  tanpura2String1Mode: StringMode

  // ── Instrument toggles ────────────────────────
  tablaActive: boolean
  surPetiActive: boolean
  manjiraActive: boolean
  swarMandalActive: boolean
  micActive: boolean

  // ── Mixer levels ─────────────────────────────
  mix: {
    tanpura1: ChannelMix
    tanpura2: ChannelMix
    tabla: ChannelMix
    aux: ChannelMix
    mic: ChannelMix
    master: ChannelMix
  }

  // ── Reverb ────────────────────────────────────
  reverbMix: number        // 0–1
  micReverbMix: number     // 0–1

  // ── Practice HUD ─────────────────────────────
  hudActive: boolean
  practiceStartTime: number | null

  // ── Actions ──────────────────────────────────
  setInitialized: (v: boolean) => void
  setPlaying: (v: boolean) => void
  togglePlaying: () => void

  setRootNote: (note: number) => void
  setFineTuneCents: (cents: number) => void

  setTaalId: (id: string) => void
  setBpm: (bpm: number) => void
  stepBpm: (delta: number) => void
  setTablaStyle: (style: TablaStyle) => void
  setCurrentBeat: (beat: number) => void

  setRaagId: (id: string) => void

  setTanpura1Active: (v: boolean) => void
  setTanpura2Active: (v: boolean) => void
  setTanpura1String1Mode: (mode: StringMode) => void
  setTanpura2String1Mode: (mode: StringMode) => void

  setTablaActive: (v: boolean) => void
  setSurPetiActive: (v: boolean) => void
  setManjiraActive: (v: boolean) => void
  setSwarMandalActive: (v: boolean) => void
  setMicActive: (v: boolean) => void

  setChannelVolume: (channel: keyof TaalForgeState['mix'], volume: number) => void
  toggleChannelMute: (channel: keyof TaalForgeState['mix']) => void
  toggleChannelSolo: (channel: keyof TaalForgeState['mix']) => void

  setReverbMix: (v: number) => void
  setMicReverbMix: (v: number) => void

  setHudActive: (v: boolean) => void
  startPracticeTimer: () => void
  stopPracticeTimer: () => void
}

// ──────────────────────────────────────────────
// Default channel mix
// ──────────────────────────────────────────────

const defaultChannel = (volume = 0.8): ChannelMix => ({
  volume,
  muted: false,
  solo: false,
})

// ──────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────

export const useTaalForgeStore = create<TaalForgeState>()(
  subscribeWithSelector((set) => ({
    initialized: false,
    playing: false,

    rootNote: 48,         // C3 = Sa
    fineTuneCents: 0,

    taalId: 'teentaal',
    bpm: 60,
    tablaStyle: 'basic',
    currentBeat: 0,

    raagId: 'yaman',

    tanpura1Active: true,
    tanpura2Active: false,
    tanpura1String1Mode: 'Pa',
    tanpura2String1Mode: 'Ma',

    tablaActive: true,
    surPetiActive: false,
    manjiraActive: false,
    swarMandalActive: false,
    micActive: false,

    mix: {
      tanpura1: defaultChannel(0.85),
      tanpura2: defaultChannel(0.75),
      tabla:    defaultChannel(0.80),
      aux:      defaultChannel(0.70),
      mic:      defaultChannel(0.80),
      master:   defaultChannel(1.0),
    },

    reverbMix: 0.25,
    micReverbMix: 0.35,

    hudActive: false,
    practiceStartTime: null,

    // ── Actions ────────────────────────────────

    setInitialized: (v) => set({ initialized: v }),
    setPlaying: (v) => set({ playing: v }),
    togglePlaying: () => set((s) => ({ playing: !s.playing })),

    setRootNote: (note) => set({ rootNote: Math.max(36, Math.min(71, note)) }),
    setFineTuneCents: (cents) => set({ fineTuneCents: Math.max(-50, Math.min(50, cents)) }),

    setTaalId: (id) => set({ taalId: id, currentBeat: 0 }),
    setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(400, bpm)) }),
    stepBpm: (delta) => set((s) => ({ bpm: Math.max(20, Math.min(400, s.bpm + delta)) })),
    setTablaStyle: (style) => set({ tablaStyle: style }),
    setCurrentBeat: (beat) => set({ currentBeat: beat }),

    setRaagId: (id) => set({ raagId: id }),

    setTanpura1Active: (v) => set({ tanpura1Active: v }),
    setTanpura2Active: (v) => set({ tanpura2Active: v }),
    setTanpura1String1Mode: (mode) => set({ tanpura1String1Mode: mode }),
    setTanpura2String1Mode: (mode) => set({ tanpura2String1Mode: mode }),

    setTablaActive: (v) => set({ tablaActive: v }),
    setSurPetiActive: (v) => set({ surPetiActive: v }),
    setManjiraActive: (v) => set({ manjiraActive: v }),
    setSwarMandalActive: (v) => set({ swarMandalActive: v }),
    setMicActive: (v) => set({ micActive: v }),

    setChannelVolume: (channel, volume) =>
      set((s) => ({
        mix: {
          ...s.mix,
          [channel]: { ...s.mix[channel], volume: Math.max(0, Math.min(1, volume)) },
        },
      })),

    toggleChannelMute: (channel) =>
      set((s) => ({
        mix: {
          ...s.mix,
          [channel]: { ...s.mix[channel], muted: !s.mix[channel].muted },
        },
      })),

    toggleChannelSolo: (channel) =>
      set((s) => ({
        mix: {
          ...s.mix,
          [channel]: { ...s.mix[channel], solo: !s.mix[channel].solo },
        },
      })),

    setReverbMix: (v) => set({ reverbMix: Math.max(0, Math.min(1, v)) }),
    setMicReverbMix: (v) => set({ micReverbMix: Math.max(0, Math.min(1, v)) }),

    setHudActive: (v) => set({ hudActive: v }),
    startPracticeTimer: () => set({ practiceStartTime: Date.now() }),
    stopPracticeTimer: () => set({ practiceStartTime: null }),
  }))
)

// ──────────────────────────────────────────────
// Selectors (memoized derived state helpers)
// ──────────────────────────────────────────────

export const selectEffectiveVolume = (
  state: TaalForgeState,
  channel: keyof TaalForgeState['mix']
): number => {
  const ch = state.mix[channel]
  const master = state.mix.master
  const anySolo = Object.values(state.mix).some((c) => c.solo)
  if (ch.muted) return 0
  if (anySolo && !ch.solo) return 0
  return ch.volume * master.volume
}
