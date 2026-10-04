import React from 'react'
import { useTaalForgeStore } from '../store/taalForgeStore'
import taalsData from '../audio/constants/taals.json'

interface VisualMetronomeProps {
  currentBeat: number
}

const VisualMetronome: React.FC<VisualMetronomeProps> = ({ currentBeat }) => {
  const { taalId } = useTaalForgeStore()
  
  const currentTaal = taalsData.taals.find(t => t.id === taalId) || taalsData.taals[0]

  // Compute vibhag boundaries for grouping
  const vibhagBoundaries = new Set<number>()
  let currentBoundary = 0
  currentTaal.vibhags.forEach((v: number) => {
    currentBoundary += v
    vibhagBoundaries.add(currentBoundary)
  })

  const getMarker = (index: number) => {
    if (currentTaal.sam.includes(index)) return { symbol: 'X', color: 'text-forge-gold' }
    if (currentTaal.khali.includes(index)) return { symbol: '0', color: 'text-[#6ab4f7]' }
    if (currentTaal.tali.includes(index)) return { symbol: (currentTaal.tali.indexOf(index) + 1).toString(), color: 'text-forge-accent' }
    return { symbol: '-', color: 'text-forge-border' }
  }

  const beats = currentTaal.beats

  return (
    <div className="bg-forge-panel rounded-2xl p-5 border border-forge-border flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-end">
        <h2 className="text-xl font-medium text-forge-text tracking-wide">{currentTaal.name}</h2>
        <div className="text-forge-text-dim text-sm font-mono tracking-wider">
          Beat {currentBeat + 1} / {beats}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-forge-bg rounded-full h-1.5 mb-2 overflow-hidden">
        <div 
          className="bg-forge-accent h-full transition-all duration-150 ease-out" 
          style={{ width: `${((currentBeat + 1) / beats) * 100}%` }}
        />
      </div>

      {/* Beats Grid */}
      <div className="flex flex-wrap gap-2 justify-start items-stretch">
        {currentTaal.bols.map((bol: string, i: number) => {
          const isActive = currentBeat === i
          const marker = getMarker(i)
          const isVibhagEnd = vibhagBoundaries.has(i + 1)

          return (
            <React.Fragment key={i}>
              <div 
                className={`
                  flex flex-col items-center justify-center p-2 rounded-xl min-w-[3.5rem]
                  transition-colors duration-75
                  ${isActive ? 'bg-forge-accent/20 animate-beat-flash ring-1 ring-forge-accent' : 'bg-forge-border/30'}
                `}
              >
                <span className="text-[10px] text-forge-text-dim mb-1 opacity-70">{i + 1}</span>
                <span className={`text-base font-medium mb-1 ${isActive ? 'text-forge-text' : 'text-forge-text-dim'}`}>
                  {bol}
                </span>
                <span className={`text-xs font-bold ${marker.color}`}>
                  {marker.symbol}
                </span>
              </div>
              
              {/* Vibhag separator */}
              {isVibhagEnd && i !== currentTaal.beats - 1 && (
                <div className="w-px bg-forge-border/60 mx-1 my-2 self-stretch" />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default VisualMetronome
