import React from 'react'
import { Volume2, VolumeX, Mic, Music, Disc, Waves } from 'lucide-react'
import { useTaalForgeStore, selectEffectiveVolume, TaalForgeState } from '../store/taalForgeStore'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MixChannel = keyof TaalForgeState['mix']

interface ChannelConfig {
  key: MixChannel
  label: string
  shortLabel: string
  Icon: React.FC<{ size?: number; className?: string }>
  isMaster?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel definitions
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS: ChannelConfig[] = [
  {
    key: 'tanpura1',
    label: 'Tanpura 1',
    shortLabel: 'T1',
    Icon: ({ size = 16, className = '' }) => <Music size={size} className={className} />,
  },
  {
    key: 'tanpura2',
    label: 'Tanpura 2',
    shortLabel: 'T2',
    Icon: ({ size = 16, className = '' }) => <Music size={size} className={className} />,
  },
  {
    key: 'tabla',
    label: 'Tabla',
    shortLabel: 'Tabla',
    Icon: ({ size = 16, className = '' }) => <Disc size={size} className={className} />,
  },
  {
    key: 'aux',
    label: 'Aux',
    shortLabel: 'Aux',
    Icon: ({ size = 16, className = '' }) => <Waves size={size} className={className} />,
  },
  {
    key: 'mic',
    label: 'Mic',
    shortLabel: 'Mic',
    Icon: ({ size = 16, className = '' }) => <Mic size={size} className={className} />,
  },
  {
    key: 'master',
    label: 'Master',
    shortLabel: 'Mstr',
    isMaster: true,
    Icon: ({ size = 16, className = '' }) => <Volume2 size={size} className={className} />,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ChannelStrip
// ─────────────────────────────────────────────────────────────────────────────

interface ChannelStripProps {
  config: ChannelConfig
}

const ChannelStrip: React.FC<ChannelStripProps> = ({ config }) => {
  const { key, shortLabel, Icon, isMaster } = config

  const channel        = useTaalForgeStore((s) => s.mix[key])
  const effectiveVol   = useTaalForgeStore((s) => selectEffectiveVolume(s, key))
  const setVolume      = useTaalForgeStore((s) => s.setChannelVolume)
  const toggleMute     = useTaalForgeStore((s) => s.toggleChannelMute)
  const toggleSolo     = useTaalForgeStore((s) => s.toggleChannelSolo)

  const { volume, muted, solo } = channel

  const isSilent = effectiveVol === 0

  return (
    <div
      className={[
        'flex flex-col items-center gap-2 bg-forge-border/30 rounded-xl p-3 flex-1 min-w-0 select-none',
        solo ? 'border border-yellow-400/40' : isMaster ? 'border border-forge-accent/30' : 'border border-transparent',
      ].join(' ')}
    >
      {/* Icon */}
      <Icon
        size={16}
        className={[
          'shrink-0 transition-colors duration-150',
          muted ? 'text-red-400' : isSilent ? 'text-forge-muted/40' : 'text-forge-accent',
        ].join(' ')}
      />

      {/* Vertical slider wrapper */}
      {/*
        We rotate a horizontal range input -90deg. The element's visual height
        comes from its width (w-28 = 7rem) after rotation, so we reserve that
        space with a fixed-height container.
      */}
      <div className="relative flex items-center justify-center" style={{ height: '7rem', width: '2rem' }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(key, parseFloat(e.target.value))}
          aria-label={`${config.label} volume`}
          className={[
            'absolute appearance-none rounded-full cursor-pointer',
            'w-28', // becomes the height after rotation
            // thumb + track colours via Tailwind arbitrary classes
            '[&::-webkit-slider-runnable-track]:rounded-full',
            '[&::-webkit-slider-runnable-track]:h-1.5',
            '[&::-webkit-slider-runnable-track]:bg-forge-border',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3',
            '[&::-webkit-slider-thumb]:h-3',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:mt-[-3px]',
            muted
              ? '[&::-webkit-slider-thumb]:bg-red-400 [&::-webkit-slider-runnable-track]:bg-red-900/30'
              : solo
              ? '[&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-runnable-track]:bg-yellow-900/20'
              : '[&::-webkit-slider-thumb]:bg-forge-accent [&::-webkit-slider-runnable-track]:bg-forge-border',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-forge-accent/60',
          ].join(' ')}
          style={{ transform: 'rotate(-90deg)' }}
        />
      </div>

      {/* Percentage readout */}
      <span
        className={[
          'text-[10px] font-mono tabular-nums leading-none',
          muted ? 'text-red-400' : 'text-forge-muted',
        ].join(' ')}
      >
        {Math.round(volume * 100)}%
      </span>

      {/* Mute button */}
      <button
        onClick={() => toggleMute(key)}
        title={muted ? 'Unmute' : 'Mute'}
        className={[
          'flex items-center justify-center w-6 h-6 rounded-md text-[10px] transition-colors duration-150',
          'hover:bg-forge-border/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-forge-accent/60',
          muted ? 'bg-red-500/20 text-red-400' : 'text-forge-muted',
        ].join(' ')}
      >
        {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
      </button>

      {/* Solo button — hidden for master */}
      {!isMaster ? (
        <button
          onClick={() => toggleSolo(key)}
          title={solo ? 'Unsolo' : 'Solo'}
          className={[
            'flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold transition-colors duration-150',
            'hover:bg-forge-border/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-yellow-400/60',
            solo ? 'bg-yellow-400/20 text-yellow-400' : 'text-forge-muted',
          ].join(' ')}
        >
          S
        </button>
      ) : (
        /* Spacer so master strip is the same height */
        <div className="w-6 h-6" />
      )}

      {/* Channel label */}
      <span className="text-[10px] font-semibold tracking-widest uppercase text-forge-muted/80 mt-1">
        {shortLabel}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReverbStrip — compact "Rev" slider treated as a 7th strip
// ─────────────────────────────────────────────────────────────────────────────

const ReverbStrip: React.FC = () => {
  const reverbMix    = useTaalForgeStore((s) => s.reverbMix)
  const setReverbMix = useTaalForgeStore((s) => s.setReverbMix)

  return (
    <div className="flex flex-col items-center gap-2 bg-forge-border/20 rounded-xl p-3 flex-1 min-w-0 border border-forge-accent/10 select-none">
      {/* Icon */}
      <Waves size={16} className="shrink-0 text-forge-accent/60" />

      {/* Vertical slider */}
      <div className="relative flex items-center justify-center" style={{ height: '7rem', width: '2rem' }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={reverbMix}
          onChange={(e) => setReverbMix(parseFloat(e.target.value))}
          aria-label="Reverb mix"
          className={[
            'absolute appearance-none rounded-full cursor-pointer',
            'w-28',
            '[&::-webkit-slider-runnable-track]:rounded-full',
            '[&::-webkit-slider-runnable-track]:h-1.5',
            '[&::-webkit-slider-runnable-track]:bg-forge-border',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3',
            '[&::-webkit-slider-thumb]:h-3',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:mt-[-3px]',
            '[&::-webkit-slider-thumb]:bg-forge-accent/60',
            '[&::-webkit-slider-runnable-track]:bg-forge-border',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-forge-accent/60',
          ].join(' ')}
          style={{ transform: 'rotate(-90deg)' }}
        />
      </div>

      {/* Percentage readout */}
      <span className="text-[10px] font-mono tabular-nums leading-none text-forge-muted">
        {Math.round(reverbMix * 100)}%
      </span>

      {/* Spacer to align with mute+solo buttons in channel strips */}
      <div className="w-6 h-6" />
      <div className="w-6 h-6" />

      {/* Label */}
      <span className="text-[10px] font-semibold tracking-widest uppercase text-forge-muted/60 mt-1">
        Rev
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MinimalMixer
// ─────────────────────────────────────────────────────────────────────────────

const MinimalMixer: React.FC = () => {
  return (
    <section aria-label="Mixer" className="w-full">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Volume2 size={13} className="text-forge-accent/70" />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-forge-muted/60">
          Mixer
        </span>
        {/* Thin separator */}
        <div className="flex-1 h-px bg-forge-border/40" />
      </div>

      {/* Channel strips row */}
      <div className="flex gap-2 w-full">
        {CHANNELS.map((ch) => (
          <ChannelStrip key={ch.key} config={ch} />
        ))}

        {/* Thin divider before reverb */}
        <div className="w-px self-stretch bg-forge-border/30 shrink-0" />

        {/* Reverb strip */}
        <ReverbStrip />
      </div>

      {/* Aux sub-label */}
      <p className="mt-2 px-1 text-[9px] text-forge-muted/40 text-center">
        Aux = Manjira · Sur Peti · Swar Mandal
      </p>
    </section>
  )
}

export default MinimalMixer
