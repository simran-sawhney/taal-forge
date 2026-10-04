import { useCallback, useEffect, useRef, useState } from 'react'
import { Drum, Wind, Waves, Mic, Radio, Music4, Circle, Square, Download, Loader2 } from 'lucide-react'
import { useTaalForgeStore } from '../store/taalForgeStore'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'available'

interface InstrumentDef {
  key: string
  label: string
  icon: React.ElementType
  activeKey:
    | 'tanpura1Active'
    | 'tanpura2Active'
    | 'tablaActive'
    | 'surPetiActive'
    | 'manjiraActive'
    | 'swarMandalActive'
    | 'micActive'
  setterKey:
    | 'setTanpura1Active'
    | 'setTanpura2Active'
    | 'setTablaActive'
    | 'setSurPetiActive'
    | 'setManjiraActive'
    | 'setSwarMandalActive'
    | 'setMicActive'
  /** optional muted icon opacity for secondary instruments */
  dimIcon?: boolean
  /** show mic-active indicator */
  showMicDot?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Instrument definitions
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUMENTS: InstrumentDef[] = [
  {
    key: 'tanpura1',
    label: 'Tanpura 1',
    icon: Music4,
    activeKey: 'tanpura1Active',
    setterKey: 'setTanpura1Active',
  },
  {
    key: 'tanpura2',
    label: 'Tanpura 2',
    icon: Music4,
    activeKey: 'tanpura2Active',
    setterKey: 'setTanpura2Active',
    dimIcon: true,
  },
  {
    key: 'tabla',
    label: 'Tabla',
    icon: Drum,
    activeKey: 'tablaActive',
    setterKey: 'setTablaActive',
  },
  {
    key: 'surPeti',
    label: 'Sur Peti',
    icon: Wind,
    activeKey: 'surPetiActive',
    setterKey: 'setSurPetiActive',
  },
  {
    key: 'manjira',
    label: 'Manjira',
    icon: Radio,
    activeKey: 'manjiraActive',
    setterKey: 'setManjiraActive',
  },
  {
    key: 'swarMandal',
    label: 'Swar Mandal',
    icon: Waves,
    activeKey: 'swarMandalActive',
    setterKey: 'setSwarMandalActive',
  },
  {
    key: 'mic',
    label: 'Mic',
    icon: Mic,
    activeKey: 'micActive',
    setterKey: 'setMicActive',
    showMicDot: true,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ToggleSwitch
// ─────────────────────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  active: boolean
  onToggle: () => void
  ariaLabel: string
}

function ToggleSwitch({ active, onToggle, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel ${
        active ? 'bg-forge-accent' : 'bg-forge-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InstrumentCard
// ─────────────────────────────────────────────────────────────────────────────

interface InstrumentCardProps {
  def: InstrumentDef
  active: boolean
  onToggle: () => void
}

function InstrumentCard({ def, active, onToggle }: InstrumentCardProps) {
  const Icon = def.icon

  return (
    <div
      className={`flex flex-col items-center gap-2.5 px-3 py-3 rounded-xl bg-forge-surface border border-forge-panel transition-all duration-200 select-none min-w-[80px] ${
        active
          ? 'ring-1 ring-forge-accent/50 shadow-lg shadow-forge-accent/10'
          : 'border-forge-panel/60'
      }`}
    >
      {/* Icon area */}
      <div className="relative">
        <Icon
          size={22}
          className={`transition-colors duration-200 ${
            active
              ? 'text-forge-accent'
              : def.dimIcon
              ? 'text-forge-muted/60'
              : 'text-forge-muted'
          }`}
        />
        {/* Red dot for mic active */}
        {def.showMicDot && active && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50 animate-pulse" />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-[10px] font-medium tracking-wide whitespace-nowrap transition-colors duration-200 ${
          active ? 'text-forge-text' : 'text-forge-muted'
        }`}
      >
        {def.label}
      </span>

      {/* Toggle */}
      <ToggleSwitch
        active={active}
        onToggle={onToggle}
        ariaLabel={`Toggle ${def.label}`}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording Controls
// ─────────────────────────────────────────────────────────────────────────────

function RecordingControls() {
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobEvent['data'][]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setRecordingBlob(blob)
        setStatus('available')
        // Stop mic tracks
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      recorder.start(250)
      mediaRecorderRef.current = recorder

      setElapsedSeconds(0)
      setRecordingBlob(null)
      setStatus('recording')

      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } catch (err) {
      console.error('[RecordingControls] Failed to start recording:', err)
      setStatus('idle')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      setStatus('stopping')
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const downloadRecording = useCallback(() => {
    if (!recordingBlob) return
    const url = URL.createObjectURL(recordingBlob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `taalforge-recording-${Date.now()}.webm`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [recordingBlob])

  const statusLabel = (): string => {
    switch (status) {
      case 'idle':
        return 'Ready to record'
      case 'recording':
        return `Recording — ${formatTime(elapsedSeconds)}`
      case 'stopping':
        return 'Finalising…'
      case 'available':
        return `Recording ready (${formatTime(elapsedSeconds)})`
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-forge-surface border border-forge-panel/60">
      {/* Record button */}
      <button
        type="button"
        aria-label="Start recording"
        disabled={status === 'recording' || status === 'stopping'}
        onClick={startRecording}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel disabled:opacity-40 disabled:cursor-not-allowed ${
          status === 'recording'
            ? 'bg-red-600 shadow-lg shadow-red-600/40 animate-pulse'
            : 'bg-red-600/20 hover:bg-red-600/40 border border-red-600/50'
        }`}
      >
        <Circle
          size={14}
          className={`${status === 'recording' ? 'text-white' : 'text-red-500'}`}
          fill={status === 'recording' ? 'currentColor' : 'none'}
        />
      </button>

      {/* Stop button */}
      <button
        type="button"
        aria-label="Stop recording"
        disabled={status !== 'recording'}
        onClick={stopRecording}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-forge-panel hover:bg-forge-muted/20 border border-forge-panel/80 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'stopping' ? (
          <Loader2 size={14} className="text-forge-muted animate-spin" />
        ) : (
          <Square size={13} className="text-forge-muted" fill="currentColor" />
        )}
      </button>

      {/* Download button */}
      <button
        type="button"
        aria-label="Download recording"
        disabled={status !== 'available'}
        onClick={downloadRecording}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-forge-panel hover:bg-forge-accent/20 border border-forge-panel/80 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent focus-visible:ring-offset-2 focus-visible:ring-offset-forge-panel disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Download
          size={14}
          className={`transition-colors duration-200 ${
            status === 'available' ? 'text-forge-accent' : 'text-forge-muted'
          }`}
        />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-forge-panel/80 mx-1" />

      {/* Status indicator */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Colour dot */}
        <span
          className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
            status === 'recording'
              ? 'bg-red-500 animate-pulse'
              : status === 'stopping'
              ? 'bg-amber-400 animate-pulse'
              : status === 'available'
              ? 'bg-forge-accent'
              : 'bg-forge-muted/50'
          }`}
        />
        <span className="text-[11px] text-forge-muted font-medium truncate">
          {statusLabel()}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InstrumentControls — main export
// ─────────────────────────────────────────────────────────────────────────────

export default function InstrumentControls() {
  // Pull all instrument active states and setters from the store
  const tanpura1Active = useTaalForgeStore((s) => s.tanpura1Active)
  const tanpura2Active = useTaalForgeStore((s) => s.tanpura2Active)
  const tablaActive = useTaalForgeStore((s) => s.tablaActive)
  const surPetiActive = useTaalForgeStore((s) => s.surPetiActive)
  const manjiraActive = useTaalForgeStore((s) => s.manjiraActive)
  const swarMandalActive = useTaalForgeStore((s) => s.swarMandalActive)
  const micActive = useTaalForgeStore((s) => s.micActive)

  const setTanpura1Active = useTaalForgeStore((s) => s.setTanpura1Active)
  const setTanpura2Active = useTaalForgeStore((s) => s.setTanpura2Active)
  const setTablaActive = useTaalForgeStore((s) => s.setTablaActive)
  const setSurPetiActive = useTaalForgeStore((s) => s.setSurPetiActive)
  const setManjiraActive = useTaalForgeStore((s) => s.setManjiraActive)
  const setSwarMandalActive = useTaalForgeStore((s) => s.setSwarMandalActive)
  const setMicActive = useTaalForgeStore((s) => s.setMicActive)

  // Map store values for easy lookup
  const activeValues: Record<InstrumentDef['activeKey'], boolean> = {
    tanpura1Active,
    tanpura2Active,
    tablaActive,
    surPetiActive,
    manjiraActive,
    swarMandalActive,
    micActive,
  }

  // Map setters for easy lookup
  const setterMap: Record<
    InstrumentDef['setterKey'],
    (v: boolean) => void
  > = {
    setTanpura1Active,
    setTanpura2Active,
    setTablaActive,
    setSurPetiActive,
    setManjiraActive,
    setSwarMandalActive,
    setMicActive,
  }

  return (
    <section
      aria-label="Instrument Controls"
      className="flex flex-col gap-3 w-full"
    >
      {/* ── Section header ── */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-forge-muted/70">
          Instruments
        </span>
        <div className="flex-1 h-px bg-forge-panel/60" />
      </div>

      {/* ── Instrument cards strip ── */}
      <div className="flex flex-wrap gap-2 w-full">
        {INSTRUMENTS.map((def) => {
          const active = activeValues[def.activeKey]
          const setter = setterMap[def.setterKey]
          return (
            <InstrumentCard
              key={def.key}
              def={def}
              active={active}
              onToggle={() => setter(!active)}
            />
          )
        })}
      </div>

      {/* ── Recording controls ── */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-forge-muted/70 whitespace-nowrap">
          Record
        </span>
        <div className="h-px bg-forge-panel/60 w-4" />
        <RecordingControls />
      </div>
    </section>
  )
}
