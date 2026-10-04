import { useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown, Zap, Music } from 'lucide-react'
import { useTaalForgeStore } from '../store/taalForgeStore'
import type { TablaStyle } from '../store/taalForgeStore'
import taalsData from '../audio/constants/taals.json'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface Taal {
  id: string
  name: string
  beats: number
  vibhags: number[]
  sam: number[]
  khali: number[]
  tali: number[]
  bols: string[]
  defaultBpm: number
}

const taals: Taal[] = taalsData.taals

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const BPM_MIN = 20
const BPM_MAX = 400
const TAP_WINDOW = 4        // number of taps to average
const TAP_EXPIRE_MS = 3000  // reset if gap > 3 s

const TABLA_STYLES: { id: TablaStyle; label: string }[] = [
  { id: 'basic',     label: 'Basic'     },
  { id: 'variation', label: 'Variation' },
  { id: 'shuffle',   label: 'Shuffle'   },
]

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function clampBpm(value: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(value)))
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function RhythmController() {
  // ── Store ─────────────────────────────────────────────────────
  const taalId      = useTaalForgeStore((s) => s.taalId)
  const bpm         = useTaalForgeStore((s) => s.bpm)
  const tablaStyle  = useTaalForgeStore((s) => s.tablaStyle)
  const setTaalId   = useTaalForgeStore((s) => s.setTaalId)
  const setBpm      = useTaalForgeStore((s) => s.setBpm)
  const stepBpm     = useTaalForgeStore((s) => s.stepBpm)
  const setTablaStyle = useTaalForgeStore((s) => s.setTablaStyle)

  // ── Tap tempo state (refs — no re-render needed) ──────────────
  const tapTimestamps = useRef<number[]>([])
  const tapFlash      = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Handlers ──────────────────────────────────────────────────

  const handleTaalSelect = useCallback(
    (id: string) => {
      setTaalId(id)
    },
    [setTaalId]
  )

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBpm(Number(e.target.value))
    },
    [setBpm]
  )

  const handleDouble = useCallback(() => {
    setBpm(clampBpm(bpm * 2))
  }, [bpm, setBpm])

  const handleHalve = useCallback(() => {
    setBpm(clampBpm(bpm / 2))
  }, [bpm, setBpm])

  const handleTap = useCallback(() => {
    const now = Date.now()
    const stamps = tapTimestamps.current

    // Expire stale taps
    if (stamps.length > 0 && now - stamps[stamps.length - 1] > TAP_EXPIRE_MS) {
      tapTimestamps.current = []
    }

    tapTimestamps.current.push(now)

    // Keep only the last TAP_WINDOW + 1 timestamps (to compute TAP_WINDOW intervals)
    if (tapTimestamps.current.length > TAP_WINDOW + 1) {
      tapTimestamps.current = tapTimestamps.current.slice(-TAP_WINDOW - 1)
    }

    // Need at least 2 taps to compute an interval
    if (tapTimestamps.current.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < tapTimestamps.current.length; i++) {
        intervals.push(tapTimestamps.current[i] - tapTimestamps.current[i - 1])
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const newBpm = clampBpm(60_000 / avgInterval)
      setBpm(newBpm)
    }

    // Clear any pending flash reset
    if (tapFlash.current) clearTimeout(tapFlash.current)
    tapFlash.current = setTimeout(() => {
      tapTimestamps.current = []
    }, TAP_EXPIRE_MS)
  }, [setBpm])

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="bg-forge-panel rounded-2xl p-5 flex flex-col gap-6 select-none">

      {/* ── Taal Selector ──────────────────────────────────────── */}
      <section>
        <p className="text-forge-text-dim text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Music size={11} className="opacity-70" />
          Taal
        </p>

        {/* Horizontally scrollable pill row */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {taals.map((taal) => {
            const isActive = taal.id === taalId
            return (
              <button
                key={taal.id}
                onClick={() => handleTaalSelect(taal.id)}
                className={[
                  'flex-shrink-0 flex flex-col items-center px-3.5 py-2 rounded-xl',
                  'text-sm font-medium transition-all duration-150 focus:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-1',
                  'focus-visible:ring-offset-forge-panel',
                  isActive
                    ? 'bg-forge-accent text-white shadow-lg shadow-forge-accent/30'
                    : 'bg-forge-border text-forge-text hover:bg-forge-border/80 hover:text-forge-accent',
                ].join(' ')}
                aria-pressed={isActive}
              >
                <span className="leading-tight">{taal.name}</span>
                <span
                  className={[
                    'text-[10px] font-normal leading-tight mt-0.5',
                    isActive ? 'text-white/70' : 'text-forge-text-dim',
                  ].join(' ')}
                >
                  {taal.beats} beats
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── BPM Control ────────────────────────────────────────── */}
      <section>
        <p className="text-forge-text-dim text-xs uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Zap size={11} className="opacity-70" />
          Tempo
        </p>

        {/* Large BPM display with –1 / +1 flanking buttons */}
        <div className="flex items-center justify-center gap-4 mb-3">
          {/* Left column: –5 / –1 */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => stepBpm(-5)}
              className="w-8 h-7 flex items-center justify-center rounded-lg bg-forge-border
                         text-forge-text-dim text-xs font-semibold hover:bg-forge-border/70
                         hover:text-forge-text transition-all duration-100 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-forge-accent"
              aria-label="Decrease BPM by 5"
            >
              −5
            </button>
            <button
              onClick={() => stepBpm(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-forge-border
                         text-forge-text hover:bg-forge-border/70 hover:text-forge-accent
                         transition-all duration-100 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-forge-accent"
              aria-label="Decrease BPM by 1"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Centre: BPM number */}
          <div className="flex flex-col items-center min-w-[7rem]">
            <span
              className="font-mono text-5xl font-light text-forge-text tabular-nums leading-none"
              aria-live="polite"
              aria-label={`${bpm} beats per minute`}
            >
              {bpm}
            </span>
            <span className="text-forge-text-dim text-xs uppercase tracking-widest mt-1">
              BPM
            </span>
          </div>

          {/* Right column: +1 / +5 */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => stepBpm(5)}
              className="w-8 h-7 flex items-center justify-center rounded-lg bg-forge-border
                         text-forge-text-dim text-xs font-semibold hover:bg-forge-border/70
                         hover:text-forge-text transition-all duration-100 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-forge-accent"
              aria-label="Increase BPM by 5"
            >
              +5
            </button>
            <button
              onClick={() => stepBpm(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-forge-border
                         text-forge-text hover:bg-forge-border/70 hover:text-forge-accent
                         transition-all duration-100 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-forge-accent"
              aria-label="Increase BPM by 1"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Slider */}
        <div className="px-1 mb-4">
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            value={bpm}
            onChange={handleSlider}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                       bg-forge-border accent-[#7c6af7]
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-[#7c6af7]
                       [&::-webkit-slider-thumb]:shadow-md
                       [&::-webkit-slider-thumb]:shadow-[#7c6af7]/40
                       [&::-webkit-slider-thumb]:transition-transform
                       [&::-webkit-slider-thumb]:duration-100
                       [&::-webkit-slider-thumb]:hover:scale-110
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:border-0
                       [&::-moz-range-thumb]:bg-[#7c6af7]
                       [&::-moz-range-thumb]:cursor-pointer"
            aria-label="BPM slider"
          />
          {/* Min / Max labels */}
          <div className="flex justify-between text-forge-text-dim text-[10px] mt-1 px-0.5">
            <span>{BPM_MIN}</span>
            <span>{BPM_MAX}</span>
          </div>
        </div>

        {/* Tap Tempo + 2x / ÷2 */}
        <div className="flex items-center justify-center gap-3">
          {/* Halve */}
          <button
            onClick={handleHalve}
            disabled={bpm <= BPM_MIN}
            className="px-3 py-1.5 rounded-lg bg-forge-border text-forge-text-dim text-xs
                       font-semibold tracking-wide hover:bg-forge-border/70 hover:text-forge-text
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-100 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-forge-accent"
            aria-label="Halve tempo"
          >
            ÷2
          </button>

          {/* Tap Tempo */}
          <button
            onClick={handleTap}
            className="flex-1 max-w-[9rem] py-2 rounded-xl bg-forge-border text-forge-text
                       text-sm font-semibold tracking-wide
                       hover:bg-forge-accent/20 hover:text-forge-accent
                       active:scale-95 active:bg-forge-accent/30
                       transition-all duration-100 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-forge-accent"
            aria-label="Tap tempo"
          >
            Tap
          </button>

          {/* Double */}
          <button
            onClick={handleDouble}
            disabled={bpm >= BPM_MAX}
            className="px-3 py-1.5 rounded-lg bg-forge-border text-forge-text-dim text-xs
                       font-semibold tracking-wide hover:bg-forge-border/70 hover:text-forge-text
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-100 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-forge-accent"
            aria-label="Double tempo"
          >
            ×2
          </button>
        </div>
      </section>

      {/* ── Style Selector ─────────────────────────────────────── */}
      <section>
        <p className="text-forge-text-dim text-xs uppercase tracking-widest mb-3">
          Style
        </p>

        <div className="flex gap-2">
          {TABLA_STYLES.map(({ id, label }) => {
            const isActive = tablaStyle === id
            return (
              <button
                key={id}
                onClick={() => setTablaStyle(id)}
                className={[
                  'flex-1 py-2 rounded-xl text-sm font-medium',
                  'transition-all duration-150 focus:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-1',
                  'focus-visible:ring-offset-forge-panel',
                  isActive
                    ? 'bg-forge-accent text-white shadow-lg shadow-forge-accent/30'
                    : 'bg-forge-border text-forge-text hover:bg-forge-border/70 hover:text-forge-accent',
                ].join(' ')}
                aria-pressed={isActive}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

    </div>
  )
}
