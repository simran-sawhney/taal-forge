import React, { useState } from 'react';
import { Music2, SlidersHorizontal, Mic } from 'lucide-react';
import { useTaalForgeStore } from '../store/taalForgeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type TanpuraStringMode = 'Pa' | 'Ma' | 'Ni';

interface TuningPanelProps {
  onDetectPitch?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_KEYS = new Set(['C#', 'D#', 'F#', 'G#', 'A#']);

/**
 * Converts a MIDI note number to a human-readable note name with octave.
 * Middle C (C4) = MIDI 60.
 */
function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/** Returns the display label for a tanpura string mode with its tuning description. */
function tanpuraDescription(mode: TanpuraStringMode): string {
  switch (mode) {
    case 'Pa':
      return 'Pa — Perfect Fifth';
    case 'Ma':
      return 'Ma — Perfect Fourth';
    case 'Ni':
      return 'Ni — Major Seventh';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PillToggleProps {
  active: boolean;
  onToggle: (v: boolean) => void;
  label: string;
}

const PillToggle: React.FC<PillToggleProps> = ({ active, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    aria-label={label}
    onClick={() => onToggle(!active)}
    className={[
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
      'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2',
      'focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel',
      active ? 'bg-forge-accent' : 'bg-forge-surface',
    ].join(' ')}
  >
    <span
      className={[
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
        'transform transition duration-200 ease-in-out',
        active ? 'translate-x-5' : 'translate-x-0',
      ].join(' ')}
    />
  </button>
);

interface StringModeSelectorProps {
  value: TanpuraStringMode;
  onChange: (mode: TanpuraStringMode) => void;
}

const MODES: TanpuraStringMode[] = ['Pa', 'Ma', 'Ni'];

const StringModeSelector: React.FC<StringModeSelectorProps> = ({ value, onChange }) => (
  <div className="flex gap-1 rounded-lg bg-forge-surface p-1">
    {MODES.map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        className={[
          'flex-1 rounded-md px-3 py-1 text-xs font-semibold tracking-wide',
          'transition-colors duration-150 focus:outline-none focus-visible:ring-1',
          'focus-visible:ring-forge-accent',
          value === mode
            ? 'bg-forge-accent text-white shadow-sm'
            : 'text-forge-muted hover:text-white',
        ].join(' ')}
      >
        {mode}
      </button>
    ))}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const TuningPanel: React.FC<TuningPanelProps> = ({ onDetectPitch }) => {
  const rootNote            = useTaalForgeStore((s) => s.rootNote);
  const fineTuneCents       = useTaalForgeStore((s) => s.fineTuneCents);
  const tanpura1Active      = useTaalForgeStore((s) => s.tanpura1Active);
  const tanpura2Active      = useTaalForgeStore((s) => s.tanpura2Active);
  const tanpura1String1Mode = useTaalForgeStore((s) => s.tanpura1String1Mode) as TanpuraStringMode;
  const tanpura2String1Mode = useTaalForgeStore((s) => s.tanpura2String1Mode) as TanpuraStringMode;

  const setRootNote            = useTaalForgeStore((s) => s.setRootNote);
  const setFineTuneCents       = useTaalForgeStore((s) => s.setFineTuneCents);
  const setTanpura1Active      = useTaalForgeStore((s) => s.setTanpura1Active);
  const setTanpura2Active      = useTaalForgeStore((s) => s.setTanpura2Active);
  const setTanpura1String1Mode = useTaalForgeStore((s) => s.setTanpura1String1Mode);
  const setTanpura2String1Mode = useTaalForgeStore((s) => s.setTanpura2String1Mode);

  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [isDetecting, setIsDetecting]   = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentOctave  = Math.floor(rootNote / 12) - 1;
  const currentNoteIdx = rootNote % 12;
  const currentNoteName = NOTE_NAMES[currentNoteIdx];

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleKeySelect = (noteIndex: number) => {
    // Keep the same octave, just change the note
    const base = (currentOctave + 1) * 12;
    setRootNote(base + noteIndex);
  };

  const handleOctaveChange = (delta: number) => {
    const next = rootNote + delta * 12;
    // Guard: Allow Octave 2 (36) to Octave 4 (71)
    if (next >= 36 && next <= 71) {
      setRootNote(next);
    }
  };

  const handleDetectPitch = async () => {
    setIsDetecting(true);
    setDetectedNote(null);
    onDetectPitch?.();
    // Simulate async detection feedback (actual logic handled by parent/callback)
    await new Promise((res) => setTimeout(res, 1200));
    setIsDetecting(false);
  };

  const fineTuneLabel =
    fineTuneCents === 0
      ? '0 ¢'
      : fineTuneCents > 0
      ? `+${fineTuneCents} ¢`
      : `${fineTuneCents} ¢`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section
      aria-label="Tuning Panel"
      className="bg-forge-panel rounded-2xl p-5 flex flex-col gap-6 select-none"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="text-forge-accent" size={18} strokeWidth={1.8} />
        <h2 className="text-sm font-semibold tracking-widest uppercase text-white">
          Tuning
        </h2>
        <span className="ml-auto text-xs text-forge-muted font-mono">
          {midiToNoteName(rootNote)}
          {fineTuneCents !== 0 && (
            <span className={fineTuneCents > 0 ? 'text-green-400' : 'text-red-400'}>
              {' '}{fineTuneCents > 0 ? '+' : ''}{fineTuneCents}¢
            </span>
          )}
        </span>
      </div>

      {/* ── 1. Root Note Selector ── */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-forge-muted uppercase tracking-wider">
          Root Note
        </label>

        {/* 2 rows × 6 cols grid */}
        <div className="grid grid-cols-6 gap-1.5">
          {NOTE_NAMES.map((name, idx) => {
            const isActive   = idx === currentNoteIdx;
            const isBlackKey = BLACK_KEYS.has(name);

            return (
              <button
                key={name}
                type="button"
                onClick={() => handleKeySelect(idx)}
                aria-pressed={isActive}
                aria-label={`Root note ${name}`}
                className={[
                  'rounded-lg py-2 text-xs font-bold tracking-tight transition-all duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent',
                  isActive
                    ? 'bg-forge-accent text-white shadow-md scale-105'
                    : isBlackKey
                    ? 'bg-forge-surface/80 text-forge-muted hover:bg-forge-surface hover:text-white border border-white/10'
                    : 'bg-forge-surface text-forge-muted hover:text-white hover:bg-forge-surface/70 border border-white/5',
                ].join(' ')}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Octave Selector ── */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-forge-muted uppercase tracking-wider">
          Octave
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleOctaveChange(-1)}
            disabled={rootNote - 12 < 36}
            aria-label="Decrease octave"
            className={[
              'h-8 w-8 rounded-lg bg-forge-surface text-white font-bold text-lg leading-none',
              'flex items-center justify-center transition-colors duration-150',
              'hover:bg-forge-accent disabled:opacity-30 disabled:cursor-not-allowed',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent',
            ].join(' ')}
          >
            −
          </button>

          <div className="flex-1 flex items-center justify-center gap-1">
            {/* Visual octave indicator */}
            {[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((oct) => (
              <div
                key={oct}
                className={[
                  'h-2 w-2 rounded-full transition-colors duration-150',
                  oct === currentOctave
                    ? 'bg-forge-accent scale-125'
                    : 'bg-forge-surface',
                ].join(' ')}
                aria-hidden="true"
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleOctaveChange(+1)}
            disabled={rootNote + 12 > 71}
            aria-label="Increase octave"
            className={[
              'h-8 w-8 rounded-lg bg-forge-surface text-white font-bold text-lg leading-none',
              'flex items-center justify-center transition-colors duration-150',
              'hover:bg-forge-accent disabled:opacity-30 disabled:cursor-not-allowed',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent',
            ].join(' ')}
          >
            +
          </button>

          <span className="w-8 text-center text-sm font-mono text-white font-semibold">
            {currentOctave}
          </span>
        </div>
      </div>

      {/* ── 3. Fine Tune ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="fine-tune-slider"
            className="text-xs font-medium text-forge-muted uppercase tracking-wider"
          >
            Fine Tune
          </label>
          <span
            className={[
              'text-xs font-mono font-semibold tabular-nums',
              fineTuneCents > 0
                ? 'text-green-400'
                : fineTuneCents < 0
                ? 'text-red-400'
                : 'text-forge-muted',
            ].join(' ')}
          >
            {fineTuneLabel}
          </span>
        </div>

        {/* Slider track with center marker */}
        <div className="relative">
          {/* Center mark at 0 */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-px -translate-y-1/2 w-0.5 h-3 bg-forge-muted/40 rounded-full pointer-events-none z-10"
            aria-hidden="true"
          />
          <input
            id="fine-tune-slider"
            type="range"
            min={-50}
            max={50}
            step={1}
            value={fineTuneCents}
            onChange={(e) => setFineTuneCents(Number(e.target.value))}
            className={[
              'w-full h-2 appearance-none rounded-full cursor-pointer',
              'bg-forge-surface',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:h-4',
              '[&::-webkit-slider-thumb]:w-4',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:bg-forge-accent',
              '[&::-webkit-slider-thumb]:shadow-md',
              '[&::-webkit-slider-thumb]:transition-transform',
              '[&::-webkit-slider-thumb]:hover:scale-110',
              '[&::-moz-range-thumb]:h-4',
              '[&::-moz-range-thumb]:w-4',
              '[&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:bg-forge-accent',
              '[&::-moz-range-thumb]:border-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel',
            ].join(' ')}
            aria-label="Fine tune in cents"
            aria-valuemin={-50}
            aria-valuemax={50}
            aria-valuenow={fineTuneCents}
            aria-valuetext={fineTuneLabel}
          />
        </div>

        {/* Endpoint labels */}
        <div className="flex justify-between text-[10px] text-forge-muted font-mono px-0.5">
          <span>−50¢</span>
          <span className="text-forge-muted/50">0</span>
          <span>+50¢</span>
        </div>
      </div>

      {/* ── 4. Tanpura String Modes ── */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-forge-muted uppercase tracking-wider flex items-center gap-1.5">
          <Music2 size={13} className="text-forge-accent" strokeWidth={1.8} />
          Tanpura Channels
        </label>

        <div className="flex flex-col gap-3">
          {/* T1 */}
          <div
            className={[
              'rounded-xl p-3 flex flex-col gap-2.5 border transition-colors duration-150',
              tanpura1Active
                ? 'bg-forge-surface border-forge-accent/30'
                : 'bg-forge-surface/40 border-white/5',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'text-xs font-bold tracking-wider px-2 py-0.5 rounded-md',
                    tanpura1Active
                      ? 'bg-forge-accent/20 text-forge-accent'
                      : 'bg-forge-surface text-forge-muted',
                  ].join(' ')}
                >
                  T1
                </span>
                <span className="text-xs text-forge-muted">
                  {tanpura1Active ? tanpuraDescription(tanpura1String1Mode) : 'Inactive'}
                </span>
              </div>
              <PillToggle
                active={tanpura1Active}
                onToggle={setTanpura1Active}
                label="Toggle Tanpura channel 1"
              />
            </div>

            <div
              className={[
                'transition-opacity duration-150',
                tanpura1Active ? 'opacity-100' : 'opacity-30 pointer-events-none',
              ].join(' ')}
            >
              <div className="mb-1 text-[10px] text-forge-muted uppercase tracking-wider">
                String 1 Mode
              </div>
              <StringModeSelector
                value={tanpura1String1Mode}
                onChange={(mode) => setTanpura1String1Mode(mode)}
              />
            </div>
          </div>

          {/* T2 */}
          <div
            className={[
              'rounded-xl p-3 flex flex-col gap-2.5 border transition-colors duration-150',
              tanpura2Active
                ? 'bg-forge-surface border-forge-accent/30'
                : 'bg-forge-surface/40 border-white/5',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'text-xs font-bold tracking-wider px-2 py-0.5 rounded-md',
                    tanpura2Active
                      ? 'bg-forge-accent/20 text-forge-accent'
                      : 'bg-forge-surface text-forge-muted',
                  ].join(' ')}
                >
                  T2
                </span>
                <span className="text-xs text-forge-muted">
                  {tanpura2Active ? tanpuraDescription(tanpura2String1Mode) : 'Inactive'}
                </span>
              </div>
              <PillToggle
                active={tanpura2Active}
                onToggle={setTanpura2Active}
                label="Toggle Tanpura channel 2"
              />
            </div>

            <div
              className={[
                'transition-opacity duration-150',
                tanpura2Active ? 'opacity-100' : 'opacity-30 pointer-events-none',
              ].join(' ')}
            >
              <div className="mb-1 text-[10px] text-forge-muted uppercase tracking-wider">
                String 1 Mode
              </div>
              <StringModeSelector
                value={tanpura2String1Mode}
                onChange={(mode) => setTanpura2String1Mode(mode)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Auto-pitch Detection ── */}
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-medium text-forge-muted uppercase tracking-wider">
          Auto-pitch Detection
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDetectPitch}
            disabled={isDetecting}
            aria-label="Detect pitch from microphone"
            className={[
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wide',
              'transition-all duration-150 focus:outline-none focus-visible:ring-2',
              'focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel',
              isDetecting
                ? 'bg-forge-accent/20 text-forge-accent cursor-wait'
                : 'bg-forge-surface text-forge-muted hover:bg-forge-accent hover:text-white',
            ].join(' ')}
          >
            <Mic
              size={14}
              strokeWidth={1.8}
              className={isDetecting ? 'animate-pulse text-forge-accent' : ''}
            />
            {isDetecting ? 'Listening…' : 'Detect Pitch'}
          </button>

          {/* Detected note badge */}
          {detectedNote && !isDetecting && (
            <div className="flex items-center gap-1.5 rounded-lg bg-forge-surface px-3 py-1.5">
              <span className="text-[10px] text-forge-muted uppercase tracking-wider">
                Detected
              </span>
              <span className="text-sm font-bold font-mono text-forge-accent">
                {detectedNote}
              </span>
            </div>
          )}

          {isDetecting && (
            <div className="flex gap-0.5 items-center" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-0.5 bg-forge-accent rounded-full animate-bounce"
                  style={{
                    height: `${8 + i * 3}px`,
                    animationDelay: `${i * 80}ms`,
                    animationDuration: '600ms',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default TuningPanel;
