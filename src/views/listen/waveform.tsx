/**
 * A recording drawn as its loudness over time, with each spoken line marked: click a line to jump to
 * it, or drag to move through the recording. Drawn from numbers made at build time, so it shows
 * before any audio has loaded.
 */
import { INK, TONE } from '@site/kit/theme'
import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react'

export interface Stretch {
    start: number
    end: number
    /** What to call it: its line of the script. */
    label: string
    /** How many models made a mistake in it, 0..1 of all of them. */
    trouble: number
}

interface WaveformProps {
    /** Loudness 0–100, evenly spaced over the recording. */
    peaks: number[]
    seconds: number
    stretches: Stretch[]
    current: number
    time: number
    onSeek: (seconds: number) => void
    onChoose: (stretch: number) => void
}

const HEIGHT = 96
const LABEL_ROOM = 16
const TROUBLE_ROOM = 8

export function Waveform({ peaks, seconds, stretches, current, time, onSeek, onChoose }: WaveformProps) {
    const frame = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(0)
    const pressed = useRef<{ x: number; dragged: boolean } | null>(null)
    const clip = useId()

    useEffect(() => {
        const element = frame.current!
        const measure = (): void => setWidth(element.clientWidth)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const across = (at: number): number => (at / seconds) * width
    const middle = LABEL_ROOM + (HEIGHT - LABEL_ROOM - TROUBLE_ROOM) / 2
    const reach = (HEIGHT - LABEL_ROOM - TROUBLE_ROOM) / 2 - 2

    /** One vertical stroke per two pixels, as tall as the loudest moment it covers. */
    const shape = useMemo(() => {
        if (!width || !peaks.length) return ''
        const strokes = Math.floor(width / 2)
        const parts: string[] = []
        for (let stroke = 0; stroke < strokes; stroke++) {
            const from = Math.floor((stroke / strokes) * peaks.length)
            const to = Math.max(from + 1, Math.floor(((stroke + 1) / strokes) * peaks.length))
            let loudest = 0
            for (let index = from; index < to; index++) loudest = Math.max(loudest, peaks[index])
            const tall = Math.max(0.6, Math.sqrt(loudest / 100) * reach)
            parts.push(`M${stroke * 2 + 1} ${(middle - tall).toFixed(1)}V${(middle + tall).toFixed(1)}`)
        }
        return parts.join('')
    }, [peaks, width, middle, reach])

    const secondsAt = (event: PointerEvent): number => {
        const bounds = frame.current!.getBoundingClientRect()
        return Math.max(0, Math.min(seconds, ((event.clientX - bounds.left) / bounds.width) * seconds))
    }

    function onPointerDown(event: PointerEvent): void {
        event.currentTarget.setPointerCapture(event.pointerId)
        pressed.current = { x: event.clientX, dragged: false }
    }

    function onPointerMove(event: PointerEvent): void {
        const press = pressed.current
        if (!press) return
        if (Math.abs(event.clientX - press.x) > 4) press.dragged = true
        if (press.dragged) onSeek(secondsAt(event))
    }

    function onPointerUp(event: PointerEvent): void {
        const press = pressed.current
        pressed.current = null
        if (!press || press.dragged) return
        // A click on a line starts it from its beginning; anywhere else goes to that moment.
        const at = secondsAt(event)
        const stretch = stretches.findIndex(candidate => at >= candidate.start - 0.15 && at <= candidate.end + 0.15)
        if (stretch >= 0) onChoose(stretch)
        else onSeek(at)
    }

    return (
        <div ref={frame} className="relative cursor-pointer touch-none select-none" style={{ height: HEIGHT }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {width > 0 && (
                <svg width={width} height={HEIGHT} className="absolute inset-0" role="img" aria-label="The recording, with each spoken line marked">
                    <defs>
                        <clipPath id={clip}>
                            <rect x={0} y={0} width={across(time)} height={HEIGHT} />
                        </clipPath>
                    </defs>
                    {stretches.map((stretch, index) => {
                        const left = across(stretch.start)
                        const wide = Math.max(2, across(stretch.end) - left)
                        const chosen = index === current
                        return (
                            <g key={index}>
                                <rect x={left} y={LABEL_ROOM} width={wide} height={HEIGHT - LABEL_ROOM - TROUBLE_ROOM} rx={4} fill={chosen ? INK.accent : INK.text} fillOpacity={chosen ? 0.16 : 0.05} stroke={chosen ? INK.accent : 'none'} strokeOpacity={0.7} />
                                {(wide > 11 || chosen) && (
                                    <text x={left + wide / 2} y={11} textAnchor="middle" fontSize={10} fill={chosen ? INK.accent : INK.muted}>
                                        {stretch.label}
                                    </text>
                                )}
                                {stretch.trouble > 0 && <rect x={left} y={HEIGHT - 4} width={wide} height={3} rx={1.5} fill={TONE.bad} fillOpacity={0.25 + 0.75 * stretch.trouble} />}
                            </g>
                        )
                    })}
                    <path d={shape} stroke={INK.axis} strokeWidth={1} />
                    <path d={shape} stroke={INK.text} strokeWidth={1} clipPath={`url(#${clip})`} />
                    <line x1={across(time)} x2={across(time)} y1={LABEL_ROOM - 2} y2={HEIGHT - TROUBLE_ROOM + 2} stroke={INK.accent} strokeWidth={1.5} />
                </svg>
            )}
        </div>
    )
}
