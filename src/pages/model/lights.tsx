/**
 * Every word one model heard, as points of light: a row per speaker, the script from left to right,
 * the mistakes glowing. Drawn in the browser; the same words are written out further down the page.
 */
import { OUTCOMES, OUTCOME_COLOR_INDEX, OUTCOME_PALETTE, hearingSentence, speakerName } from '@site/heard'
import { type Frame, type Plot, Points } from '@site/kit/points'
import { Tip } from '@site/kit/story'
import type { Outcome, Script, Step } from '@site/spoken'
import { useEffect, useMemo, useRef, useState } from 'react'

const STEP_OUTCOMES: Record<Step['kind'], Outcome> = { same: 'right', substituted: 'wrong', missed: 'dropped', added: 'added' }
/** Room between the script's lines, in words' widths, when a speaker's words fit on one row. */
const LINE_GAP = 0.9
const TOP = 20

interface Light {
    speaker: number
    step: Step
}

/** Where every light goes for a given width, and how tall the picture is. */
function arrange(script: Script, lights: Light[], speakers: number, width: number) {
    const gutter = width >= 720 ? 84 : 24
    const across = Math.max(1, width - gutter - 6)
    const words = script.words.length
    const oneRow = across / (words + (script.lines.length - 1) * LINE_GAP) >= 4.4
    const rowsEach = oneRow ? 1 : Math.ceil((words * 5) / across)
    const perRow = Math.ceil(words / rowsEach)
    const pitch = oneRow ? across / (words + (script.lines.length - 1) * LINE_GAP) : across / perRow
    const rowPitch = Math.max(8, Math.min(13, pitch * 1.6))
    const block = rowsEach * rowPitch + (oneRow ? 12 : 10)
    const height = TOP + speakers * block
    const plot: Plot = { x: gutter, y: TOP, width: across, height: height - TOP }
    const column = (word: number): number => (oneRow ? word + script.words[Math.min(word, words - 1)].line * LINE_GAP : word % perRow)
    const x = new Float32Array(lights.length)
    const y = new Float32Array(lights.length)
    const color = new Uint8Array(lights.length)
    const bright = new Float32Array(lights.length)
    const scale = new Float32Array(lights.length)
    lights.forEach(({ speaker, step }, index) => {
        const outcome = STEP_OUTCOMES[step.kind]
        // An added word sits just before, and a little above, the word it came before.
        const nudge = outcome === 'added' ? -0.5 : 0
        const row = oneRow ? 0 : Math.floor(Math.min(step.word, words - 1) / perRow)
        x[index] = ((column(step.word) + 0.5 + nudge) * pitch) / plot.width
        y[index] = (speaker * block + (row + 0.5 + nudge * 0.7) * rowPitch) / plot.height
        color[index] = OUTCOME_COLOR_INDEX[outcome]
        bright[index] = outcome === 'right' ? 0.55 : 1
        scale[index] = outcome === 'right' ? 1 : 1.7
    })
    const frame: Frame = { x, y, color, bright, scale, radius: Math.max(1.1, Math.min(2.6, pitch * 0.34)) }
    const lineStarts = oneRow ? script.lines.map((_, line) => gutter + column(script.words.findIndex(word => word.line === line)) * pitch) : []
    return { height, plot, frame, gutter, block, rowsEach, rowPitch, lineStarts }
}

export function Lights({ script, rows }: { script: Script; rows: { id: string; steps: Step[] }[] }) {
    const holder = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const points = useRef<Points | null>(null)
    const [width, setWidth] = useState(0)
    const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null)
    const lights = useMemo(() => rows.flatMap((row, speaker) => row.steps.map((step): Light => ({ speaker, step }))), [rows])
    const layout = useMemo(() => arrange(script, lights, rows.length, width || 960), [script, lights, rows.length, width])

    useEffect(() => {
        const element = holder.current!
        const measure = (): void => setWidth(element.clientWidth)
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!canvas.current || !lights.length) return
        const made = new Points(canvas.current, lights.length, OUTCOME_PALETTE)
        points.current = made
        return () => {
            made.destroy()
            points.current = null
        }
    }, [lights.length])

    useEffect(() => {
        const field = points.current
        if (!field || !width) return
        field.resize(width, layout.height, layout.plot)
        field.set(layout.frame)
        setHovered(null)
    }, [layout, width])

    function onPointer(event: React.PointerEvent): void {
        const field = points.current
        if (!field) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const index = field.pick(event.clientX - bounds.left, event.clientY - bounds.top, event.pointerType === 'touch' ? 20 : 10)
        if (index < 0) return setHovered(null)
        const [x, y] = field.at(index)
        setHovered({ index, x, y })
    }

    const light = hovered ? lights[hovered.index] : undefined
    const word = light ? script.words[Math.min(light.step.word, script.words.length - 1)] : undefined
    return (
        <div ref={holder} className="relative" style={{ height: layout.height }} onPointerMove={event => event.pointerType === 'mouse' && onPointer(event)} onPointerDown={onPointer} onPointerLeave={() => setHovered(null)}>
            <canvas ref={canvas} className="absolute inset-0" />
            {rows.map((row, speaker) => (
                <span key={row.id} className="absolute left-0 -translate-y-1/2 text-[11px] leading-none text-muted-foreground" style={{ top: TOP + speaker * layout.block + (layout.rowsEach * layout.rowPitch) / 2 }}>
                    {layout.gutter > 40 ? speakerName(row.id) : speakerName(row.id).replace('Speaker ', '')}
                </span>
            ))}
            {layout.lineStarts.map((left, line) => (
                <span key={line} className="absolute top-0 font-mono text-[10px] leading-none text-muted-foreground/70" style={{ left }}>
                    {line + 1}
                </span>
            ))}
            {hovered && light && word && (
                <Tip x={hovered.x} y={hovered.y} width={width}>
                    <p className="text-xs text-muted-foreground">
                        {speakerName(rows[light.speaker].id)} · line {word.line + 1}
                    </p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-foreground/80">“{script.lines[word.line]}”</p>
                    <p className="text-xs font-medium" style={{ color: OUTCOMES[STEP_OUTCOMES[light.step.kind]].color }}>
                        {hearingSentence(STEP_OUTCOMES[light.step.kind], word.text, light.step.heard)}
                    </p>
                </Tip>
            )}
        </div>
    )
}
