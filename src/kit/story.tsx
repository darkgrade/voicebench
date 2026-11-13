/**
 * A scrolling story: a sticky field of points that morphs from one arrangement to the next as
 * captions scroll past. The captions are plain HTML (prerendered, readable without the picture);
 * the points arrive once their data has loaded.
 *
 * Shared by Toolbench, Voicebench and Cambench: keep the three copies in step.
 */
import { Card, CardContent } from '@kevinschaich/components'
import { type Frame, type Plot, Points } from '@site/kit/points'
import { GLASS, INK, TYPE } from '@site/kit/theme'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

/** Words placed in the plot: an axis tick, a row name, a callout. */
export interface Label {
    /** Position in the plot, 0..1 from its top left (may sit just outside it). */
    u: number
    v: number
    text: string
    align?: 'start' | 'center' | 'end'
    tone?: 'muted' | 'strong' | 'accent'
    href?: string
}

/** A line or band drawn under the points: a limit, a target, a stretch of the script. */
export interface Mark {
    u0: number
    v0: number
    u1: number
    v1: number
    tone?: 'band' | 'line' | 'accent'
}

export interface Scene extends Frame {
    labels?: Label[]
    marks?: Mark[]
}

/** The plot's size in CSS pixels, so a layout can fit rows and columns to it. */
export interface Space {
    width: number
    height: number
    wide: boolean
}

export interface Step {
    id: string
    kicker: string
    title: string
    body: ReactNode
    /** Anything under the body: a small chart, a standout. */
    extra?: ReactNode
    /** The picture for this step. */
    scene: (space: Space) => Scene
    /** A point to ring. */
    focus?: number
    /** A large faint word behind the picture. */
    watermark?: string
}

interface StoryProps {
    /** How many points there are; 0 until their data has loaded. */
    count: number
    palette: string[]
    steps: Step[]
    /** What to show beside a point under the pointer. */
    tip?: (index: number) => ReactNode
    /** A click or tap on a point. */
    onSelect?: (index: number) => void
    /** What follows the story in the same scroll: a ranking, links. */
    children?: ReactNode
}

const CAPTION_WIDTH = 430

export function Story({ count, palette, steps, tip, onSelect, children }: StoryProps) {
    const scroller = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const points = useRef<Points | null>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    const [active, setActive] = useState(0)
    const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null)
    const wide = size.width >= 768

    const plot: Plot = useMemo(() => {
        if (!size.width) return { x: 0, y: 0, width: 1, height: 1 }
        const left = Math.min(CAPTION_WIDTH + 64, size.width * 0.42)
        return wide ? { x: left + 24, y: 56, width: size.width - left - 84, height: size.height - 120 } : { x: 44, y: 44, width: size.width - 68, height: size.height * 0.46 - 40 }
    }, [size, wide])

    useEffect(() => {
        const element = scroller.current!
        const measure = (): void => setSize({ width: element.clientWidth, height: element.clientHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!canvas.current || !count) return
        const made = new Points(canvas.current, count, palette)
        points.current = made
        return () => {
            made.destroy()
            points.current = null
        }
    }, [count, palette])

    // The step crossing the middle of the view is the active one.
    useEffect(() => {
        const root = scroller.current!
        const observer = new IntersectionObserver(
            entries => {
                for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
            },
            { root, rootMargin: '-50% 0px -50% 0px' }
        )
        root.querySelectorAll('[data-step]').forEach(element => observer.observe(element))
        return () => observer.disconnect()
    }, [steps.length])

    const step = steps[Math.min(active, steps.length - 1)]
    const scene = useMemo(() => (count && size.width ? step.scene({ width: plot.width, height: plot.height, wide }) : null), [count, step, plot, wide, size.width])

    useEffect(() => {
        const field = points.current
        if (!field || !scene || !size.width) return
        field.resize(size.width, size.height, plot)
        field.set(scene)
        setHovered(null)
    }, [scene, size, plot])

    function onPointer(event: React.PointerEvent, select: boolean): void {
        const field = points.current
        if (!field) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const index = field.pick(event.clientX - bounds.left, event.clientY - bounds.top, event.pointerType === 'touch' ? 24 : 14)
        if (index < 0) return setHovered(null)
        const [x, y] = field.at(index)
        setHovered({ index, x, y })
        if (select && event.pointerType !== 'touch') onSelect?.(index)
    }

    const ring = hovered ?? (step.focus !== undefined && points.current && scene ? { index: step.focus, x: plot.x + scene.x[step.focus] * plot.width, y: plot.y + scene.y[step.focus] * plot.height } : null)
    const viewHeight = size.height || 640

    return (
        <div ref={scroller} className="relative h-full overflow-y-auto overscroll-contain" style={{ background: INK.background }}>
            <div className="relative">
                <div className="pointer-events-none absolute inset-0">
                    <div
                        className="pointer-events-auto sticky top-0 overflow-hidden"
                        style={{ height: size.height || '100%' }}
                        onPointerMove={event => event.pointerType === 'mouse' && onPointer(event, false)}
                        onPointerDown={event => onPointer(event, true)}
                        onPointerLeave={() => setHovered(null)}
                    >
                        {step.watermark && (
                            <div key={step.watermark} className={`${TYPE.display} ks-fade pointer-events-none absolute top-3 right-4 opacity-[0.07] select-none sm:right-10 sm:text-[8rem]`}>
                                {step.watermark}
                            </div>
                        )}
                        {scene && <Marks key={`marks-${step.id}`} marks={scene.marks ?? []} plot={plot} />}
                        <canvas ref={canvas} className="absolute inset-0" />
                        {scene && <Labels key={`labels-${step.id}`} labels={scene.labels ?? []} plot={plot} />}
                        {ring && (
                            <span
                                className="pointer-events-none absolute rounded-full border border-white/90"
                                style={{ left: ring.x, top: ring.y, width: 18, height: 18, transform: 'translate(-50%, -50%)', transition: hovered ? undefined : 'left 1.3s, top 1.3s' }}
                            />
                        )}
                        <Progress count={steps.length} active={active} wide={wide} />
                        {hovered && tip && (
                            <Tip x={hovered.x} y={hovered.y} width={size.width}>
                                {tip(hovered.index)}
                            </Tip>
                        )}
                    </div>
                </div>
                <div className="pointer-events-none relative">
                    {steps.map((item, index) => (
                        <section key={item.id} data-step={index} className={`flex px-4 sm:px-8 ${wide ? 'items-center' : 'items-end pb-[5vh]'}`} style={{ minHeight: viewHeight * 1.1 }}>
                            <div
                                className={`pointer-events-auto w-full transition-[opacity,transform] duration-500 ${index === active ? 'opacity-100' : 'translate-y-4 opacity-25'} ${wide ? '' : 'overflow-y-auto rounded-xl'}`}
                                style={wide ? { maxWidth: CAPTION_WIDTH } : { maxHeight: viewHeight * 0.46 }}
                            >
                                <Card className={GLASS}>
                                    <CardContent className="space-y-3">
                                        <p className={TYPE.label}>{item.kicker}</p>
                                        <h2 className={TYPE.title}>{item.title}</h2>
                                        <div className={`${TYPE.body} space-y-3`}>{item.body}</div>
                                        {item.extra}
                                    </CardContent>
                                </Card>
                            </div>
                        </section>
                    ))}
                    <div style={{ height: viewHeight * 0.25 }} />
                </div>
            </div>
            {children}
        </div>
    )
}

function Labels({ labels, plot }: { labels: Label[]; plot: Plot }) {
    return (
        <div className="ks-fade-late pointer-events-none absolute inset-0">
            {labels.map((label, index) => {
                const shift = label.align === 'start' ? '0' : label.align === 'end' ? '-100%' : '-50%'
                const tone = label.tone === 'strong' ? 'text-foreground font-medium' : label.tone === 'accent' ? 'font-medium' : 'text-muted-foreground'
                const style = { left: plot.x + label.u * plot.width, top: plot.y + label.v * plot.height, transform: `translate(${shift}, -50%)`, color: label.tone === 'accent' ? INK.accent : undefined }
                return label.href ? (
                    <a key={index} href={label.href} className={`pointer-events-auto absolute text-[11px] leading-none whitespace-nowrap hover:underline ${tone}`} style={style}>
                        {label.text}
                    </a>
                ) : (
                    <span key={index} className={`absolute text-[11px] leading-none whitespace-nowrap ${tone}`} style={style}>
                        {label.text}
                    </span>
                )
            })}
        </div>
    )
}

function Marks({ marks, plot }: { marks: Mark[]; plot: Plot }) {
    return (
        <svg className="ks-fade-late pointer-events-none absolute inset-0 size-full">
            {marks.map((mark, index) => {
                const x0 = plot.x + mark.u0 * plot.width
                const y0 = plot.y + mark.v0 * plot.height
                const x1 = plot.x + mark.u1 * plot.width
                const y1 = plot.y + mark.v1 * plot.height
                if (mark.tone === 'band') return <rect key={index} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} rx={6} fill="oklch(1 0 0 / 0.045)" />
                return <line key={index} x1={x0} y1={y0} x2={x1} y2={y1} stroke={mark.tone === 'accent' ? INK.accent : INK.axis} strokeDasharray={mark.tone === 'accent' ? '4 4' : '2 4'} strokeWidth={1} />
            })}
        </svg>
    )
}

function Progress({ count, active, wide }: { count: number; active: number; wide: boolean }) {
    return (
        <div className={`pointer-events-none absolute flex gap-1.5 ${wide ? 'top-1/2 right-3 -translate-y-1/2 flex-col' : 'top-1.5 left-1/2 -translate-x-1/2'}`}>
            {Array.from({ length: count }, (_, index) => (
                <span
                    key={index}
                    className="rounded-full transition-all duration-500"
                    style={{ width: wide || index !== active ? 4 : 14, height: wide && index === active ? 14 : 4, background: index === active ? INK.text : INK.axis }}
                />
            ))}
        </div>
    )
}

/** A small card beside a point, kept inside the view. */
export function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
    const cardWidth = Math.min(300, width - 24)
    const left = Math.max(12, Math.min(width - cardWidth - 12, x - cardWidth / 2))
    const below = y < 220
    return (
        <div className="pointer-events-none absolute z-10" style={{ left, top: below ? y + 16 : undefined, bottom: below ? undefined : `calc(100% - ${y - 16}px)`, width: cardWidth }}>
            <Card size="sm" className="border-white/10 bg-[oklch(0.18_0.006_285/0.96)] shadow-xl">
                <CardContent className="space-y-1">{children}</CardContent>
            </Card>
        </div>
    )
}
