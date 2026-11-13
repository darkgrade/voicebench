/**
 * Field: every model on two axes you choose. Up is better, left is less of what you give up (waiting,
 * disk, memory); the line marks the models nothing else beats on both. Bubbles are sized by memory.
 */
import { Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { BENCH, type ModelSummary, percent, seconds } from '@site/data'
import { shortName } from '@site/heard'
import { GLASS, INK, TONE, TYPE } from '@site/kit/theme'
import { fitLabels } from '@site/views/labels'
import { Filters, useFilters } from '@site/views/table'
import { scaleLinear, scaleLog, scaleSqrt } from 'd3-scale'
import { useEffect, useMemo, useRef, useState } from 'react'

interface Axis {
    id: string
    label: string
    value: (model: ModelSummary) => number | null | undefined
    format: (value: number) => string
    /** Values that span orders of magnitude are spread on a log scale. */
    log?: boolean
    /** Lower is better, so low values are drawn at the top. */
    lowerIsBetter?: boolean
    /** A value worth marking: the one-second target. */
    target?: number
}

const TARGET_MILLISECONDS = 1000
const gigabytes = (value: number): string => `${value < 1 ? value.toFixed(2) : value.toFixed(value < 10 ? 1 : 0)} GB`
const ACROSS: Axis[] = [
    { id: 'wait', label: 'Typical wait', value: model => model.latencyMedianMs, format: seconds, log: true, target: TARGET_MILLISECONDS },
    { id: 'slow', label: 'Slow wait', value: model => model.latencyP90Ms, format: seconds, log: true, target: TARGET_MILLISECONDS },
    { id: 'download', label: 'Download', value: model => model.sizeGigabytes || null, format: gigabytes, log: true },
    { id: 'memory', label: 'Memory', value: model => model.peakMemoryGigabytes, format: gigabytes, log: true },
]
const UP: Axis[] = [
    { id: 'errors', label: 'Word errors', value: model => model.wordErrorRate, format: value => percent(value, value < 0.1 ? 1 : 0), log: true, lowerIsBetter: true },
    { id: 'score', label: 'Score', value: model => model.score, format: value => String(Math.round(value)) },
]
const MODE_COLORS: Record<string, string> = { 'whole utterance': TONE.good, streaming: INK.accent }
const modeColor = (model: ModelSummary): string => MODE_COLORS[model.mode ?? 'whole utterance'] ?? TONE.good

function Choice({ label, options, value, onChange }: { label: string; options: Axis[]; value: string; onChange: (id: string) => void }) {
    return (
        <Tabs value={value} onValueChange={chosen => onChange(String(chosen))}>
            <TabsList aria-label={label}>
                {options.map(option => (
                    <TabsTrigger key={option.id} value={option.id}>
                        {option.label}
                    </TabsTrigger>
                ))}
            </TabsList>
        </Tabs>
    )
}

/** Round values (1, 2, 5 × powers of ten) inside a log axis's range. */
function logTicks([low, high]: [number, number]): number[] {
    const ticks: number[] = []
    for (let power = Math.floor(Math.log10(low)); power <= Math.ceil(Math.log10(high)); power++) for (const step of [1, 2, 5]) ticks.push(step * 10 ** power)
    return ticks.filter(tick => tick >= low && tick <= high)
}

/** Models nothing else beats on both axes (higher up, further left), left to right. */
function frontier(points: { x: number; y: number }[]): { x: number; y: number }[] {
    const sorted = [...points].sort((first, second) => first.x - second.x || second.y - first.y)
    const kept: { x: number; y: number }[] = []
    for (const point of sorted) if (!kept.length || point.y > kept[kept.length - 1].y) kept.push(point)
    return kept
}

export default function FieldView(_: ViewProps) {
    const frame = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    const [acrossId, setAcrossId] = useState('wait')
    const [upId, setUpId] = useState('errors')
    const [hovered, setHovered] = useState<string | null>(null)
    const { chosen, choose, shown } = useFilters()
    const across = ACROSS.find(axis => axis.id === acrossId)!
    const up = UP.find(axis => axis.id === upId)!

    useEffect(() => {
        const element = frame.current!
        const measure = (): void => setSize({ width: element.clientWidth, height: element.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const plot = useMemo(() => {
        const narrow = size.width < 640
        const margin = { top: 28, right: narrow ? 16 : 32, bottom: 44, left: narrow ? 44 : 64 }
        const placed = shown.flatMap(model => {
            const x = across.value(model)
            const y = up.value(model)
            return typeof x === 'number' && typeof y === 'number' ? [{ model, x, y }] : []
        })
        if (!placed.length || !size.width) return null
        const xs = placed.map(point => point.x)
        const ys = placed.map(point => point.y)
        const x = scaleLog().domain([Math.min(...xs) * 0.8, Math.max(...xs, across.target ?? 0) * 1.25]).range([margin.left, size.width - margin.right])
        const top = margin.top
        const bottom = size.height - margin.bottom
        const pad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1
        const y = up.log
            ? scaleLog().domain([Math.min(...ys) * 0.75, Math.max(...ys) * 1.3]).range(up.lowerIsBetter ? [top, bottom] : [bottom, top])
            : scaleLinear().domain([Math.min(...ys) - pad, Math.max(...ys) + pad]).range(up.lowerIsBetter ? [top, bottom] : [bottom, top])
        const radius = scaleSqrt().domain([0, 14]).range([4, narrow ? 15 : 24])
        const points = placed.map(point => ({ ...point, px: x(point.x), py: y(point.y), r: radius(point.model.peakMemoryGigabytes ?? 2) }))
        const best = frontier(points.map(point => ({ x: point.px, y: -point.py }))).map(point => ({ x: point.x, y: -point.y }))
        const named = narrow ? points.slice(0, 6) : points
        const names = fitLabels(named.map(point => ({ x: point.px, y: point.py, clearance: point.r + 5, text: shortName(point.model), id: point.model.id })), size.width - 4, bottom)
        const upTicks = up.log ? logTicks(y.domain() as [number, number]) : (y as ReturnType<typeof scaleLinear<number, number>>).ticks(5)
        return { margin, x, y, points, best, names, upTicks, bottom }
    }, [shown, across, up, size])

    const focus = plot?.points.find(point => point.model.id === hovered)
    return (
        <div className="flex h-full flex-col" style={{ background: INK.background }}>
            <div className="flex flex-wrap items-center gap-2 px-4 pt-2 sm:px-8">
                <Choice label="Up" options={UP} value={upId} onChange={setUpId} />
                <span className="text-xs text-muted-foreground">against</span>
                <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                    <Choice label="Across" options={ACROSS} value={acrossId} onChange={setAcrossId} />
                </div>
                <span className="ml-auto hidden xl:block">
                    <Filters chosen={chosen} choose={choose} />
                </span>
            </div>
            <div ref={frame} className="relative min-h-0 flex-1" onPointerLeave={() => setHovered(null)}>
                {plot && (
                    <svg width={size.width} height={size.height} className="absolute inset-0">
                        {logTicks(plot.x.domain() as [number, number]).map(tick => (
                            <g key={`x${tick}`}>
                                <line x1={plot.x(tick)} x2={plot.x(tick)} y1={plot.margin.top} y2={plot.bottom} stroke={INK.grid} />
                                <text x={plot.x(tick)} y={plot.bottom + 18} textAnchor="middle" fontSize={11} fill={INK.muted}>
                                    {across.format(tick)}
                                </text>
                            </g>
                        ))}
                        {plot.upTicks.map(tick => (
                            <g key={`y${tick}`}>
                                <line x1={plot.margin.left} x2={size.width - plot.margin.right} y1={plot.y(tick)} y2={plot.y(tick)} stroke={INK.grid} />
                                <text x={plot.margin.left - 8} y={plot.y(tick) + 4} textAnchor="end" fontSize={11} fill={INK.muted}>
                                    {up.format(tick)}
                                </text>
                            </g>
                        ))}
                        {across.target !== undefined && (
                            <g>
                                <line x1={plot.x(across.target)} x2={plot.x(across.target)} y1={plot.margin.top} y2={plot.bottom} stroke={INK.accent} strokeDasharray="2 4" />
                                <text x={plot.x(across.target) - 6} y={plot.margin.top + 10} textAnchor="end" fontSize={11} fill={INK.accent}>
                                    One second
                                </text>
                            </g>
                        )}
                        <text x={size.width - plot.margin.right} y={size.height - 8} textAnchor="end" fontSize={11} fill={INK.muted}>
                            {across.label} →
                        </text>
                        <text x={plot.margin.left - 8} y={14} textAnchor="start" fontSize={11} fill={INK.muted}>
                            ↑ {up.lowerIsBetter ? `Fewer ${up.label.toLowerCase()}` : up.label}
                        </text>
                        <polyline points={plot.best.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={INK.accent} strokeDasharray="4 4" strokeOpacity={0.7} />
                        {plot.points.map(point => (
                            <a key={point.model.id} href={`${BENCH.path}${point.model.id}/`} onPointerEnter={() => setHovered(point.model.id)} aria-label={point.model.name}>
                                <g style={{ transform: `translate(${point.px}px, ${point.py}px)`, transition: 'transform 0.8s cubic-bezier(0.65, 0, 0.35, 1)' }}>
                                    <circle r={point.r} fill={modeColor(point.model)} fillOpacity={hovered && hovered !== point.model.id ? 0.1 : 0.28} stroke={modeColor(point.model)} strokeWidth={hovered === point.model.id ? 2 : 1} />
                                    <circle r={2} fill={INK.text} />
                                </g>
                            </a>
                        ))}
                        {plot.names.map(name => (
                            <text key={name.item.id} x={name.x} y={name.y + 4} textAnchor={name.anchor} fontSize={11} fill={INK.text} fillOpacity={hovered && hovered !== name.item.id ? 0.25 : 0.85} className="pointer-events-none">
                                {name.item.text}
                            </text>
                        ))}
                    </svg>
                )}
                {focus && (
                    <div className={`pointer-events-none absolute z-10 w-64 rounded-xl border p-3 ${GLASS}`} style={{ left: Math.max(8, Math.min(size.width - 264, focus.px + focus.r + 10)), top: Math.max(8, Math.min(size.height - 170, focus.py - 60)) }}>
                        <p className="font-heading text-sm font-semibold">{focus.model.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {focus.model.maker} · {focus.model.mode === 'streaming' ? 'listens as you speak' : 'hears a whole line'}
                        </p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            {[
                                ['Score', String(focus.model.score ?? '–')],
                                ['Word errors', percent(focus.model.wordErrorRate)],
                                ['Typical wait', seconds(focus.model.latencyMedianMs)],
                                ['Slow wait', seconds(focus.model.latencyP90Ms)],
                                ['Download', focus.model.sizeGigabytes ? gigabytes(focus.model.sizeGigabytes) : '–'],
                                ['Memory', focus.model.peakMemoryGigabytes ? gigabytes(focus.model.peakMemoryGigabytes) : '–'],
                            ].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">{label}</dt>
                                    <dd className={TYPE.number}>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-xs text-muted-foreground sm:px-8">
                <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: TONE.good }} />
                    Hears a whole line
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: INK.accent }} />
                    Listens as you speak
                </span>
                <span>Bigger circle, more memory</span>
                <span>Dashed line: nothing beats these on both</span>
            </p>
        </div>
    )
}
