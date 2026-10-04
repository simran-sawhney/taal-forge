import { useEffect, useState, useRef } from 'react'
import { Battery, Clock, X } from 'lucide-react'
import { useTaalForgeStore } from '../store/taalForgeStore'
import taalsData from '../audio/constants/taals.json'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface TaalDefinition {
  id: string
  name: string
  beats: number
  vibhags: number[]
  sam: number[]
  khali: number[]
  tali: number[]
  bols: string[]
  bolTypes: string[]
  defaultBpm: number
}

interface PracticeHUDProps {
  active: boolean
  onDismiss: () => void
  currentBeat: number
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function PracticeHUD({ active, onDismiss, currentBeat }: PracticeHUDProps) {
  const bpm             = useTaalForgeStore((s) => s.bpm)
  const taalId          = useTaalForgeStore((s) => s.taalId)
  const practiceStartTime = useTaalForgeStore((s) => s.practiceStartTime)

  // ── Elapsed timer ────────────────────────────
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (active && practiceStartTime !== null) {
      // Immediately set the current elapsed so there's no stale display
      setElapsed(Math.floor((Date.now() - practiceStartTime) / 1000))

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - practiceStartTime!) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (!active) setElapsed(0)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [active, practiceStartTime])

  // ── Beat flash ───────────────────────────────
  const [beatFlash, setBeatFlash] = useState(false)
  const prevBeatRef = useRef<number>(-1)

  useEffect(() => {
    if (!active) return
    if (currentBeat !== prevBeatRef.current) {
      prevBeatRef.current = currentBeat
      setBeatFlash(true)
      const t = setTimeout(() => setBeatFlash(false), 180)
      return () => clearTimeout(t)
    }
  }, [currentBeat, active])

  // ── Taal data ────────────────────────────────
  const taals = (taalsData as { taals: TaalDefinition[] }).taals
  const taal  = taals.find((t) => t.id === taalId) ?? taals[0]
  const totalBeats = taal.beats
  const isSam      = taal.sam.includes(currentBeat)
  const isTali     = taal.tali.includes(currentBeat)
  const isKhali    = taal.khali.includes(currentBeat)
  const displayBeat = currentBeat + 1   // 1-indexed for display

  // ── Vibhag grouping: map each beat index to its vibhag ──
  const beatVibhag: number[] = []
  let vibhagIdx = 0
  let vibhagCount = 0
  for (let i = 0; i < totalBeats; i++) {
    beatVibhag.push(vibhagIdx)
    vibhagCount++
    if (vibhagCount >= taal.vibhags[vibhagIdx]) {
      vibhagIdx++
      vibhagCount = 0
    }
  }

  // ── Render guard ─────────────────────────────
  // Keep the element in the DOM but hidden so transitions work
  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label="Practice HUD"
      className={[
        'fixed inset-0 z-50 bg-forge-bg/95 backdrop-blur-sm',
        'flex flex-col items-center justify-center',
        'transition-opacity duration-500 ease-in-out',
        active ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      {/* ── Top-right controls ──────────────────── */}
      <div className="absolute top-6 right-6 flex items-center gap-4">
        {/* Elapsed timer */}
        <div className="flex items-center gap-1.5 text-forge-text-dim">
          <Clock size={14} strokeWidth={1.5} />
          <span className="font-mono text-sm tabular-nums">{formatElapsed(elapsed)}</span>
        </div>

        {/* Battery-safe indicator */}
        <div className="flex items-center gap-1 text-forge-text-dim opacity-40" title="Battery-safe mode">
          <Battery size={14} strokeWidth={1.5} />
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className={[
            'flex items-center justify-center w-8 h-8 rounded-full',
            'bg-forge-surface/60 hover:bg-forge-panel/80',
            'text-forge-text-dim hover:text-forge-text',
            'transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-text/40',
          ].join(' ')}
          aria-label="Dismiss practice overlay"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* ── Current taal name ────────────────────── */}
      <p className="absolute top-6 left-6 font-light text-forge-text-dim text-sm tracking-widest uppercase">
        {taal.name}
      </p>

      {/* ── Huge beat counter ────────────────────── */}
      <div className="relative flex items-center justify-center select-none">
        {/* Pulsing ring — rendered via CSS, no heavy animation */}
        <span
          key={currentBeat}   // re-mount on each beat so animation re-triggers
          aria-hidden="true"
          className={[
            'absolute rounded-full border',
            isSam
              ? 'w-[26vw] h-[26vw] border-amber-400/30'
              : 'w-[24vw] h-[24vw] border-forge-text/10',
            'animate-ping',
            // Limit ping to a single iteration via style trick below
          ].join(' ')}
          style={{ animationDuration: '600ms', animationIterationCount: 1 }}
        />

        {/* Beat number */}
        <span
          className={[
            'font-mono font-thin leading-none transition-colors duration-100',
            isSam
              ? 'text-[22vw] text-amber-400'
              : 'text-[20vw] text-forge-text',
            beatFlash ? 'animate-beat-flash' : '',
          ].join(' ')}
        >
          {displayBeat}
        </span>
      </div>

      {/* ── Bol label ───────────────────────────── */}
      {taal.bols[currentBeat] && (
        <p
          className={[
            'mt-2 font-light tracking-widest uppercase text-2xl transition-colors duration-100',
            isSam   ? 'text-amber-400/80'       :
            isTali  ? 'text-forge-text/70'       :
            isKhali ? 'text-forge-text-dim/60'   :
                      'text-forge-text-dim/50',
          ].join(' ')}
        >
          {taal.bols[currentBeat]}
        </p>
      )}

      {/* ── Taal progress dots ───────────────────── */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 max-w-[80vw]">
        {Array.from({ length: totalBeats }, (_, i) => {
          const isCurrentDot = i === currentBeat
          const isSamDot     = taal.sam.includes(i)
          const isTaliDot    = taal.tali.includes(i)
          const isKhaliDot   = taal.khali.includes(i)

          // Add a small spacer between vibhags
          const vibhagBoundary = i > 0 && beatVibhag[i] !== beatVibhag[i - 1]

          return (
            <div key={i} className={`flex items-center ${vibhagBoundary ? 'ml-3' : ''}`}>
              <span
                className={[
                  'rounded-full transition-all duration-100',
                  isCurrentDot
                    ? isSamDot
                      ? 'w-4 h-4 bg-amber-400 shadow-[0_0_12px_3px_rgba(251,191,36,0.5)]'
                      : 'w-4 h-4 bg-forge-text shadow-[0_0_10px_2px_rgba(255,255,255,0.25)]'
                    : isSamDot
                      ? 'w-2.5 h-2.5 bg-amber-400/40'
                      : isTaliDot
                        ? 'w-2 h-2 bg-forge-text/50'
                        : isKhaliDot
                          ? 'w-2 h-2 border border-forge-text-dim/40 bg-transparent'
                          : 'w-2 h-2 bg-forge-text-dim/25',
                ].join(' ')}
                title={taal.bols[i]}
              />
            </div>
          )
        })}
      </div>

      {/* ── Vibhag labels (tali / khali markers) ── */}
      <div className="mt-4 flex gap-6 text-xs text-forge-text-dim/50 font-light tracking-widest uppercase">
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/60" />
          Sam
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-forge-text/50" />
          Tali
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full border border-forge-text-dim/40" />
          Khali
        </span>
      </div>

      {/* ── BPM display ─────────────────────────── */}
      <p className="absolute bottom-8 text-forge-text-dim text-2xl font-light tracking-wider tabular-nums">
        {bpm} <span className="text-lg opacity-60">BPM</span>
      </p>
    </div>
  )
}
