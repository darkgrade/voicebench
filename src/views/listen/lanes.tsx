/**
 * One lane per model for the spoken line being heard: a bar runs from the end of the line until the
 * model's text arrives, then the text lands, with its mistakes marked against the script.
 */
import { BENCH, type ModelSummary, seconds } from '@site/data'
import { type Heard, type Said, shortName } from '@site/heard'
import { INK, TONE, TYPE } from '@site/kit/theme'
import { Transcript } from '@site/views/listen/transcript'
import { memo, useEffect, useRef } from 'react'

/** The longest wait the bar has room for, in milliseconds; longer ones fill it. */
export const LONGEST_SHOWN = 2000
export const TARGET = 1000
/** Short waits get more of the bar than a straight scale would give them, so quick models can be told apart. */
export const barShare = (milliseconds: number): number => Math.sqrt(Math.min(LONGEST_SHOWN, Math.max(0, milliseconds)) / LONGEST_SHOWN)
export const BAR_TICKS = [100, 500, TARGET]

/** Where a lane is: the line is still being spoken, the model is working, or its text has arrived. */
export type Phase = 'listening' | 'waiting' | 'landed'

/** Milliseconds since the line ended, or null when everything should be shown as it ended up. */
export function phaseOf(said: Said, sinceEnd: number | null): Phase {
    if (sinceEnd === null) return 'landed'
    if (sinceEnd < 0) return 'listening'
    // A line that never got any text is given up on once the bar is full.
    return sinceEnd >= (said.wait ?? LONGEST_SHOWN) ? 'landed' : 'waiting'
}

interface LaneProps {
    heard: Heard
    model: ModelSummary
    rank: number
    said: Said
    phase: Phase
    /** While waiting: milliseconds since the line ended. */
    sinceEnd: number
    chosen: boolean
}

export const Lane = memo(function Lane({ heard, model, rank, said, phase, sinceEnd, chosen }: LaneProps) {
    const row = useRef<HTMLLIElement>(null)
    useEffect(() => {
        if (chosen) row.current?.scrollIntoView({ block: 'nearest' })
    }, [chosen])
    const landed = phase === 'landed'
    const late = said.wait === null || said.wait >= TARGET
    const filled = landed ? barShare(said.wait ?? LONGEST_SHOWN) : phase === 'waiting' ? barShare(sinceEnd) : 0
    return (
        <li ref={row} className={`grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-4 gap-y-1 border-b border-white/5 px-4 py-2.5 sm:grid-cols-[13rem_10rem_minmax(0,1fr)] sm:px-8 ${chosen ? 'bg-white/[0.06]' : ''}`}>
            <a href={`${BENCH.path}${model.id}/`} className="group flex min-w-0 items-baseline gap-2">
                <span className={`${TYPE.number} w-5 shrink-0 text-right text-xs text-muted-foreground`}>{rank}</span>
                <span className="truncate text-sm font-medium group-hover:underline">{shortName(model)}</span>
            </a>
            <div className="flex items-center gap-2">
                <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${filled * 100}%`, background: !landed ? INK.text : late ? TONE.bad : TONE.good }} />
                    <span className="absolute -inset-y-1 w-px" style={{ left: `${barShare(TARGET) * 100}%`, background: INK.accent }} />
                </div>
                <span className={`${TYPE.number} w-14 shrink-0 text-right text-xs whitespace-nowrap ${landed && late ? '' : 'text-muted-foreground'}`} style={landed && late ? { color: TONE.bad } : undefined}>
                    {landed ? (said.wait === null ? 'no text' : seconds(said.wait)) : ''}
                </span>
            </div>
            <p className={`col-span-2 min-h-6 text-sm leading-relaxed transition-opacity duration-150 sm:col-span-1 ${landed ? 'opacity-100' : 'opacity-0'}`}>
                <Transcript script={heard.words} said={said} />
            </p>
        </li>
    )
})

/** The column headings over the lanes, with the bar's scale. */
export function LaneHeadings() {
    return (
        <div className={`sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_8.5rem] items-end gap-x-4 border-b border-white/10 px-4 py-1.5 sm:grid-cols-[13rem_10rem_minmax(0,1fr)] sm:px-8 ${TYPE.label}`} style={{ background: INK.background }}>
            <span>Model</span>
            <div className="flex items-center gap-2">
                <div className="relative h-3 flex-1 normal-case">
                    {BAR_TICKS.map(tick => (
                        <span key={tick} className={`absolute -translate-x-1/2 tracking-normal ${tick === TARGET ? '' : 'hidden sm:block'}`} style={{ left: `${barShare(tick) * 100}%`, color: tick === TARGET ? INK.accent : undefined }}>
                            {tick === TARGET ? `${tick / 1000} s` : tick / 1000}
                        </span>
                    ))}
                </div>
                <span className="w-14 shrink-0 text-right">Wait</span>
            </div>
            <span className="hidden sm:block">What it wrote</span>
        </div>
    )
}
