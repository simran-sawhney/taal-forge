/**
 * App.tsx — TaalForge main layout
 *
 * Implements:
 * - "Tap to Start Practice" audio gate (satisfies browser autoplay policy)
 * - Responsive layout: vertical stack on mobile, grid on desktop
 * - Practice HUD activation after 30s of inactivity
 * - AudioBridge initialization on gate open
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square, BookOpen, Mic, Download, Disc3, Sparkles } from 'lucide-react'

import { useTaalForgeStore } from './store/taalForgeStore'
import { AudioBridge } from './audio/AudioBridge'

// Components
import RhythmController from './components/RhythmController'
import VisualMetronome from './components/VisualMetronome'
import TuningPanel from './components/TuningPanel'
import MinimalMixer from './components/MinimalMixer'
import PresetsDrawer from './components/PresetsDrawer'
import PracticeHUD from './components/PracticeHUD'
import InstrumentControls from './components/InstrumentControls'

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

const INACTIVITY_TIMEOUT_MS = 30_000

// ──────────────────────────────────────────────────────────────────
// Start Gate
// ──────────────────────────────────────────────────────────────────

function StartGate({ onStart }: { onStart: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      await onStart()
    } catch (e) {
      console.error('Failed to initialize audio:', e)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-forge-bg">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#7c6af7 1px, transparent 1px), linear-gradient(90deg, #7c6af7 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 max-w-sm text-center px-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-forge-accent/10 border border-forge-accent/30 flex items-center justify-center">
            <Disc3 className="w-8 h-8 text-forge-accent" />
          </div>
          <div>
            <h1 className="text-3xl font-light tracking-wide text-forge-text">
              Taal<span className="text-forge-accent font-medium">Forge</span>
            </h1>
            <p className="text-forge-text-dim text-sm mt-1 font-light">
              Classical Indian Practice Studio
            </p>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-forge-text-dim text-sm leading-relaxed font-light">
          Tabla • Tanpura • Swar Mandal • Sur Peti
          <br />
          <span className="text-forge-text-dim/60 text-xs">
            Precision audio · Zero drift · Raga-aware
          </span>
        </p>

        {/* CTA */}
        <button
          onClick={handleStart}
          disabled={loading}
          className="
            group relative flex items-center gap-3 px-8 py-4 rounded-2xl
            bg-forge-accent hover:bg-forge-accent/90 active:scale-95
            text-white font-medium text-base transition-all duration-150
            disabled:opacity-60 disabled:cursor-not-allowed
            shadow-lg shadow-forge-accent/20
          "
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Initializing…
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Begin Practice Session
            </>
          )}
        </button>

        <p className="text-forge-text-dim/40 text-xs">
          Tap to enable audio · Web Audio API
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────

function AppHeader({
  onOpenPresets,
  isRecording,
  onStartRecord,
  onStopRecord,
  onDownload,
  hasRecording,
}: {
  onOpenPresets: () => void
  isRecording: boolean
  onStartRecord: () => void
  onStopRecord: () => void
  onDownload: () => void
  hasRecording: boolean
}) {
  const { playing, togglePlaying, taalId, bpm, raagId } = useTaalForgeStore()
  const raagName = raagId.charAt(0).toUpperCase() + raagId.slice(1)

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface/80 backdrop-blur-md sticky top-0 z-40">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center">
          <Disc3 className="w-4 h-4 text-forge-accent" />
        </div>
        <div className="hidden sm:block">
          <span className="text-forge-text font-medium text-sm">TaalForge</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-forge-text-dim text-xs capitalize">{raagName}</span>
            <span className="text-forge-border">·</span>
            <span className="text-forge-text-dim text-xs capitalize">{taalId}</span>
            <span className="text-forge-border">·</span>
            <span className="text-forge-text-dim text-xs font-mono">{bpm} BPM</span>
          </div>
        </div>
      </div>

      {/* Center — Play/Stop */}
      <button
        onClick={togglePlaying}
        className={`
          flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm
          transition-all duration-150 active:scale-95
          ${playing
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            : 'bg-forge-accent text-white hover:bg-forge-accent/90 shadow-md shadow-forge-accent/20'
          }
        `}
      >
        {playing ? (
          <>
            <Square className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">Stop</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">Play</span>
          </>
        )}
      </button>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Recording */}
        <div className="flex items-center gap-1">
          {!isRecording ? (
            <button
              onClick={onStartRecord}
              title="Start Recording"
              className="p-2 rounded-lg text-forge-text-dim hover:text-red-400 hover:bg-forge-border/50 transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onStopRecord}
              title="Stop Recording"
              className="p-2 rounded-lg text-red-400 bg-red-400/10 animate-record-pulse"
            >
              <Mic className="w-4 h-4" />
            </button>
          )}
          {hasRecording && !isRecording && (
            <button
              onClick={onDownload}
              title="Download Recording"
              className="p-2 rounded-lg text-forge-accent hover:bg-forge-border/50 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Presets */}
        <button
          onClick={onOpenPresets}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-border/50 transition-colors text-sm"
        >
          <BookOpen className="w-4 h-4" />
          <span className="hidden sm:inline">Raags</span>
        </button>
      </div>
    </header>
  )
}

// ──────────────────────────────────────────────────────────────────
// Main App
// ──────────────────────────────────────────────────────────────────

export default function App() {
  const { initialized, setInitialized, playing, currentBeat, hudActive, setHudActive } =
    useTaalForgeStore()

  const [presetsOpen, setPresetsOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)

  const bridgeRef = useRef<AudioBridge | null>(null)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initialize audio on user gesture ────────────────────────────

  const handleStart = useCallback(async () => {
    const bridge = AudioBridge.getInstance()
    bridgeRef.current = bridge
    await bridge.initialize()
    bridge.bindStore()
    setInitialized(true)
  }, [setInitialized])

  // ── Inactivity HUD trigger ────────────────────────────────────

  const resetInactivityTimer = useCallback(() => {
    if (!playing) return
    if (hudActive) setHudActive(false)
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(() => {
      if (useTaalForgeStore.getState().playing) {
        setHudActive(true)
      }
    }, INACTIVITY_TIMEOUT_MS)
  }, [playing, hudActive, setHudActive])

  useEffect(() => {
    if (!playing) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      setHudActive(false)
      return
    }
    resetInactivityTimer()
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [playing]) // eslint-disable-line

  // ── Recording handlers ────────────────────────────────────────

  const handleStartRecord = useCallback(() => {
    bridgeRef.current?.startRecording()
    setIsRecording(true)
    setRecordingBlob(null)
  }, [])

  const handleStopRecord = useCallback(async () => {
    const blob = await bridgeRef.current?.stopRecording()
    setIsRecording(false)
    if (blob) setRecordingBlob(blob)
  }, [])

  const handleDownload = useCallback(() => {
    if (recordingBlob && bridgeRef.current) {
      bridgeRef.current.downloadRecording(recordingBlob)
    }
  }, [recordingBlob])

  // ── Pitch detect ──────────────────────────────────────────────

  const handleDetectPitch = useCallback(async () => {
    if (!bridgeRef.current) return
    const freq = await bridgeRef.current.detectPitchFromMic()
    if (freq) {
      // Convert frequency to nearest MIDI note
      const midi = Math.round(12 * Math.log2(freq / 440) + 69)
      const clamped = Math.max(48, Math.min(72, midi))
      useTaalForgeStore.getState().setRootNote(clamped)
    }
  }, [])

  // ── Cleanup ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      bridgeRef.current?.destroy()
    }
  }, [])

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  if (!initialized) {
    return <StartGate onStart={handleStart} />
  }

  return (
    <div
      className="min-h-screen bg-forge-bg flex flex-col"
      onPointerMove={resetInactivityTimer}
      onKeyDown={resetInactivityTimer}
    >
      {/* Practice HUD overlay */}
      <PracticeHUD
        active={hudActive}
        onDismiss={() => setHudActive(false)}
        currentBeat={currentBeat}
      />

      {/* Presets drawer */}
      <PresetsDrawer open={presetsOpen} onClose={() => setPresetsOpen(false)} />

      {/* Header */}
      <AppHeader
        onOpenPresets={() => setPresetsOpen(true)}
        isRecording={isRecording}
        onStartRecord={handleStartRecord}
        onStopRecord={handleStopRecord}
        onDownload={handleDownload}
        hasRecording={!!recordingBlob}
      />

      {/* Main content */}
      <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
        {/*
          Layout strategy:
          - Mobile: single column stack
          - Tablet (md): 2-col grid
          - Desktop (lg): 3-col grid with mixer sidebar
        */}
        <div className="max-w-7xl mx-auto grid gap-3 sm:gap-4
          grid-cols-1
          md:grid-cols-2
          lg:grid-cols-[1fr_1fr_220px]
        ">

          {/* ── Row 1 Left: Visual Metronome ─────────────────── */}
          <div className="lg:col-span-2">
            <VisualMetronome currentBeat={currentBeat} />
          </div>

          {/* ── Row 1 Right: Mixer (desktop sidebar) ──────────── */}
          <div className="md:col-span-2 lg:col-span-1 lg:row-span-3">
            <MinimalMixer />
          </div>

          {/* ── Row 2 Left: Rhythm Controller ────────────────── */}
          <div className="md:col-span-1">
            <RhythmController />
          </div>

          {/* ── Row 2 Right: Tuning Panel ─────────────────────── */}
          <div className="md:col-span-1">
            <TuningPanel onDetectPitch={handleDetectPitch} />
          </div>

          {/* ── Row 3: Instrument Controls (full width on lg) ─── */}
          <div className="md:col-span-2 lg:col-span-2">
            <InstrumentControls />
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-forge-border text-center">
        <p className="text-forge-text-dim/40 text-xs">
          TaalForge · Web Audio API · Drift-free precision · Classical Indian Raga &amp; Taal
        </p>
      </footer>
    </div>
  )
}
