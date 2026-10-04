import { useState } from 'react'
import { X, Search, BookOpen, Clock } from 'lucide-react'
import { useTaalForgeStore } from '../store/taalForgeStore'
import raagsData from '../audio/constants/raags.json'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface Raag {
  id: string
  name: string
  time: string
  thaat: string
  aroha: string[]
  avaroha: string[]
  vadi: string
  samvadi: string
  notes: number[]
  semitones: number[]
  tanpuraSadhana: string
  description: string
}

interface PresetsDrawerProps {
  open: boolean
  onClose: () => void
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Map a tanpuraSadhana string (e.g. "Sa-Pa" or "Sa-Ma") to a human-readable
 * recommendation shown below the Apply button.
 */
function tanpuraRecommendationLabel(sadhana: string): string {
  switch (sadhana) {
    case 'Sa-Pa':
      return 'Tanpura: Sa–Pa tuning (standard)'
    case 'Sa-Ma':
      return 'Tanpura: Sa–Ma tuning (Madhyam emphasis)'
    case 'Sa-Ni':
      return 'Tanpura: Sa–Ni tuning (Nishad emphasis)'
    default:
      return `Tanpura: ${sadhana} tuning`
  }
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function PresetsDrawer({ open, onClose }: PresetsDrawerProps) {
  const [query, setQuery] = useState('')

  const raagId = useTaalForgeStore((s) => s.raagId)
  const setRaagId = useTaalForgeStore((s) => s.setRaagId)
  const setTanpura1String1Mode = useTaalForgeStore((s) => s.setTanpura1String1Mode)
  const setTanpura2String1Mode = useTaalForgeStore((s) => s.setTanpura2String1Mode)

  const raags: Raag[] = raagsData.raags

  // Filter by name, thaat, or time
  const filtered = raags.filter((r) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      r.thaat.toLowerCase().includes(q) ||
      r.time.toLowerCase().includes(q)
    )
  })

  /**
   * Apply a raag: set the raagId and configure the Tanpura string modes to
   * match the raag's recommended sadhana tuning.
   */
  function handleApply(raag: Raag) {
    setRaagId(raag.id)

    // Configure tanpura string modes based on sadhana recommendation
    if (raag.tanpuraSadhana === 'Sa-Ma') {
      setTanpura1String1Mode('Ma')
      setTanpura2String1Mode('Ma')
    } else if (raag.tanpuraSadhana === 'Sa-Ni') {
      setTanpura1String1Mode('Ni')
      setTanpura2String1Mode('Ni')
    } else {
      // Default: Sa-Pa
      setTanpura1String1Mode('Pa')
      setTanpura2String1Mode('Pa')
    }
  }

  return (
    <>
      {/* ── Backdrop overlay ──────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={[
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
      />

      {/* ── Drawer panel ─────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Raag Directory"
        className={[
          'fixed top-0 right-0 z-50 h-full w-80 flex flex-col',
          'bg-forge-surface border-l border-forge-border',
          'shadow-2xl transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-forge-border shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-forge-accent" aria-hidden="true" />
            <h2 className="text-forge-text font-semibold text-sm tracking-wide">
              Raag Directory
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Raag Directory"
            className="p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-border/50 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-forge-text-dim pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, thaat, or time…"
              className="bg-forge-border/50 rounded-lg pl-8 pr-3 py-2 text-forge-text text-xs placeholder-forge-text-dim border-0 outline-none focus:ring-1 focus:ring-forge-accent w-full"
              aria-label="Search raags"
            />
          </div>

          {/* Result count */}
          <p className="mt-2 text-xs text-forge-text-dim">
            {filtered.length} {filtered.length === 1 ? 'raag' : 'raags'} found
          </p>
        </div>

        {/* ── Scrollable raag list ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-forge-text-dim text-xs gap-2">
              <BookOpen className="w-8 h-8 opacity-30" aria-hidden="true" />
              <span>No raags match your search.</span>
            </div>
          ) : (
            filtered.map((raag) => {
              const isActive = raag.id === raagId

              return (
                <article
                  key={raag.id}
                  className={[
                    'bg-forge-panel rounded-xl p-4 mb-3 cursor-pointer',
                    'border transition-all duration-150',
                    isActive
                      ? 'border-forge-accent shadow-[0_0_0_1px_theme(colors.forge-accent/0.3)]'
                      : 'border-forge-border hover:border-forge-accent/50',
                  ].join(' ')}
                  onClick={() => handleApply(raag)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {/* ── Raag name + active badge ──────────────────────────── */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-forge-text font-semibold text-sm leading-tight">
                      {raag.name}
                    </h3>
                    {isActive && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-forge-accent/20 text-forge-accent leading-tight">
                        Active
                      </span>
                    )}
                  </div>

                  {/* ── Time of day ───────────────────────────────────────── */}
                  <div className="flex items-center gap-1.5 text-forge-text-dim text-xs mb-1">
                    <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{raag.time}</span>
                  </div>

                  {/* ── Thaat ─────────────────────────────────────────────── */}
                  <div className="text-forge-text-dim text-xs mb-2">
                    <span className="text-forge-text/50 mr-1">Thaat:</span>
                    {raag.thaat}
                  </div>

                  {/* ── Aroha scale ───────────────────────────────────────── */}
                  <div className="mb-3">
                    <p className="text-[10px] text-forge-text-dim mb-0.5 uppercase tracking-wider">
                      Aroha
                    </p>
                    <p className="text-forge-text text-xs font-mono leading-snug">
                      {raag.aroha.join(' · ')}
                    </p>
                  </div>

                  {/* ── Vadi / Samvadi ────────────────────────────────────── */}
                  <div className="flex gap-4 mb-3">
                    <div>
                      <p className="text-[10px] text-forge-text-dim uppercase tracking-wider mb-0.5">
                        Vadi
                      </p>
                      <p className="text-forge-text text-xs font-mono">{raag.vadi}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-forge-text-dim uppercase tracking-wider mb-0.5">
                        Samvadi
                      </p>
                      <p className="text-forge-text text-xs font-mono">{raag.samvadi}</p>
                    </div>
                  </div>

                  {/* ── Apply button ──────────────────────────────────────── */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleApply(raag)
                    }}
                    className={[
                      'w-full py-1.5 rounded-lg text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-forge-accent/20 text-forge-accent cursor-default'
                        : 'bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98]',
                    ].join(' ')}
                    aria-label={`Apply ${raag.name}`}
                    disabled={isActive}
                  >
                    {isActive ? 'Applied' : 'Apply'}
                  </button>

                  {/* ── Tanpura recommendation ────────────────────────────── */}
                  <p className="mt-2 text-[10px] text-forge-text-dim text-center leading-snug">
                    {tanpuraRecommendationLabel(raag.tanpuraSadhana)}
                  </p>
                </article>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}
