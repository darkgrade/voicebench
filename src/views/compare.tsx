/**
 * Compare: two models side by side. Their scores area by area, each speaker, how long each kept you
 * waiting on every spoken line, and the words only one of them missed.
 */
import { NativeSelect, NativeSelectOption } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { BENCH, MODELS, type ModelSummary, percent, seconds } from '@site/data'
import { type Heard, type Run, listenQuery, outcomeAt, speakerName, spokenAt, summary, useHeard } from '@site/heard'
import { Loading } from '@site/kit/shell'
import { INK, TONE, TYPE } from '@site/kit/theme'
import { useEffect, useState } from 'react'

const SIDES = [TONE.good, INK.accent]
const FASTEST = 20
const SLOWEST = 5000
const TARGET = 1000
/** Where a wait falls on the strip, 0–100, on a log scale; lines with no text sit at the far end. */
const across = (milliseconds: number | null): number => (Math.log(Math.min(SLOWEST, Math.max(FASTEST, milliseconds ?? SLOWEST)) / FASTEST) / Math.log(SLOWEST / FASTEST)) * 100

function Picker({ side, id, onChange }: { side: number; id: string; onChange: (id: string) => void }) {
    const model = summary(id)
    return (
        <div className="flex min-w-0 flex-col gap-2 border-t-2 pt-3" style={{ borderColor: SIDES[side] }}>
            <NativeSelect value={id} onChange={event => onChange(event.target.value)} aria-label={side === 0 ? 'First model' : 'Second model'} className="max-w-full min-w-0">
                {MODELS.map((option, index) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                        {index + 1}. {option.name}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
            <div className="flex items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {[model.maker, model.sizeGigabytes ? `${model.sizeGigabytes.toFixed(1)} GB` : null, model.licence].filter(Boolean).join(' · ')}
                </p>
                <a href={`${BENCH.path}${id}/`} className="group shrink-0 text-right">
                    <span className={`${TYPE.number} block text-4xl leading-none font-semibold`} style={{ color: SIDES[side] }}>
                        {model.score}
                    </span>
                    <span className="text-xs text-muted-foreground group-hover:underline">its page →</span>
                </a>
            </div>
        </div>
    )
}

function Areas({ models }: { models: ModelSummary[] }) {
    const areas = models[0].reasons ?? []
    return (
        <section className="flex flex-col gap-3">
            <p className={TYPE.label}>How the score adds up</p>
            {areas.map((area, index) => (
                <div key={area.area} className="grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[9rem_1fr]">
                    <span className="text-sm">
                        {area.area}
                        <span className="block text-xs text-muted-foreground">counts {area.weight}%</span>
                    </span>
                    <div className="flex flex-col gap-1.5">
                        {models.map((model, side) => {
                            const reason = model.reasons?.[index]
                            return (
                                <div key={side} className="grid grid-cols-[1fr_auto] items-center gap-3">
                                    <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                                        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${reason?.score ?? 0}%`, background: SIDES[side] }} />
                                    </span>
                                    <span className="w-36 truncate text-xs text-muted-foreground sm:w-56">{reason?.why}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </section>
    )
}

function Speakers({ heard, models }: { heard: Heard; models: ModelSummary[] }) {
    const rate = (model: ModelSummary, speaker: string): number => model.bySpeaker?.[speaker] ?? 0
    const most = Math.max(0.01, ...heard.speakers.flatMap(speaker => models.map(model => rate(model, speaker.id))))
    return (
        <section className="flex flex-col gap-3">
            <p className={TYPE.label}>Word errors, speaker by speaker</p>
            <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
                {heard.speakers.map(speaker => (
                    <div key={speaker.id} className="grid grid-cols-[5rem_1fr] items-center gap-x-4">
                        <span className="text-sm">{speakerName(speaker.id)}</span>
                        <div className="flex flex-col gap-1.5">
                            {models.map((model, side) => (
                                <div key={side} className="grid grid-cols-[1fr_3rem] items-center gap-3">
                                    <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                                        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(rate(model, speaker.id) / most) * 100}%`, background: SIDES[side] }} />
                                    </span>
                                    <span className={`${TYPE.number} text-right text-xs text-muted-foreground`}>{percent(rate(model, speaker.id))}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

function Waits({ runs }: { runs: Run[][] }) {
    const ticks = [50, 100, 250, 500, TARGET, 2500]
    return (
        <section className="flex flex-col gap-2">
            <p className={TYPE.label}>The wait after every spoken line</p>
            {runs.map((bySpeaker, side) => (
                <div key={side} className="relative h-7">
                    {ticks.map(tick => (
                        <span key={tick} className="absolute inset-y-0 w-px" style={{ left: `${across(tick)}%`, background: tick === TARGET ? INK.accent : INK.grid }} />
                    ))}
                    {bySpeaker.flatMap((run, speaker) =>
                        run.said.map((line, index) => (
                            <span
                                key={`${speaker}-${index}`}
                                className="absolute size-2 -translate-1/2 rounded-full"
                                style={{ left: `${across(line.wait)}%`, top: `${20 + ((index * 7 + speaker * 3) % 10) * 6}%`, background: SIDES[side], opacity: line.wait === null ? 0.25 : 0.6 }}
                            />
                        ))
                    )}
                </div>
            ))}
            <div className="relative h-4 text-[11px] text-muted-foreground">
                {ticks.map(tick => (
                    <span key={tick} className={`absolute -translate-x-1/2 ${tick === 250 || tick === 2500 ? 'hidden sm:block' : ''}`} style={{ left: `${across(tick)}%`, color: tick === TARGET ? INK.accent : undefined }}>
                        {tick / 1000} s
                    </span>
                ))}
                <span className="absolute right-0">no text</span>
            </div>
        </section>
    )
}

/** A script word one model missed and the other heard, with the speakers it happened for. */
interface Miss {
    word: number
    wrote: string
    speakers: number[]
}

function onlyMissedBy(heard: Heard, mine: Run[], theirs: Run[]): Miss[] {
    const misses = new Map<number, Miss>()
    mine.forEach((run, speaker) => {
        for (let word = 0; word < heard.words.length; word++) {
            if (outcomeAt(run, word) === 'right' || outcomeAt(theirs[speaker], word) !== 'right') continue
            const miss = misses.get(word) ?? { word, wrote: run.heard.find(([at]) => at === word)?.[1] ?? '', speakers: [] }
            miss.speakers.push(speaker)
            misses.set(word, miss)
        }
    })
    return [...misses.values()].sort((first, second) => second.speakers.length - first.speakers.length || first.word - second.word)
}

const SHOWN_MISSES = 14

function Misses({ heard, runs, ids, onOpen }: { heard: Heard; runs: Run[][]; ids: string[]; onOpen: ViewProps['onOpen'] }) {
    return (
        <section className="flex flex-col gap-3">
            <p className={TYPE.label}>Words only one of them missed</p>
            <div className="grid gap-6 sm:grid-cols-2">
                {runs.map((mine, side) => {
                    const misses = onlyMissedBy(heard, mine, runs[1 - side])
                    return (
                        <div key={side} className="flex min-w-0 flex-col gap-1.5 border-l-2 pl-3" style={{ borderColor: SIDES[side] }}>
                            <p className="text-sm text-muted-foreground">
                                {misses.length ? `${summary(ids[side]).name} missed ${misses.length} ${misses.length === 1 ? 'word' : 'words'} the other heard.` : `${summary(ids[side]).name} missed nothing the other heard.`}
                            </p>
                            {misses.slice(0, SHOWN_MISSES).map(miss => {
                                const speaker = miss.speakers[0]
                                const query = listenQuery(heard.speakers[speaker].id, ids[side], spokenAt(mine[speaker], miss.word))
                                return (
                                    <a
                                        key={miss.word}
                                        href={`${BENCH.path}listen/${query}`}
                                        onClick={event => {
                                            event.preventDefault()
                                            onOpen('listen', query)
                                        }}
                                        className="group flex items-baseline justify-between gap-3 text-sm"
                                    >
                                        <span className="min-w-0 truncate group-hover:underline">
                                            “{heard.words[miss.word].text}” <span className="text-muted-foreground">{miss.wrote ? `written as “${miss.wrote}”` : 'dropped'}</span>
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            line {heard.words[miss.word].line + 1} · {miss.speakers.length === 1 ? speakerName(heard.speakers[speaker].id).toLowerCase() : `${miss.speakers.length} speakers`}
                                        </span>
                                    </a>
                                )
                            })}
                            {misses.length > SHOWN_MISSES && <p className="text-xs text-muted-foreground">and {misses.length - SHOWN_MISSES} more</p>}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function Facts({ models }: { models: ModelSummary[] }) {
    const rows: [string, (model: ModelSummary) => string][] = [
        ['Word errors', model => percent(model.wordErrorRate)],
        ['Wrong words', model => String(model.errors?.substitutions ?? '–')],
        ['Dropped words', model => String(model.errors?.deletions ?? '–')],
        ['Added words', model => String(model.errors?.insertions ?? '–')],
        ['Typical wait', model => seconds(model.latencyMedianMs)],
        ['Slow wait', model => seconds(model.latencyP90Ms)],
        ['Under a second', model => percent(model.withinTarget, 0)],
        ['Memory used', model => (model.peakMemoryGigabytes ? `${model.peakMemoryGigabytes.toFixed(1)} GB` : '–')],
        ['Load time', model => (model.loadSeconds !== undefined ? `${model.loadSeconds} s` : '–')],
    ]
    return (
        <section className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1.5 text-sm">
            {rows.map(([label, read]) => (
                <div key={label} className="col-span-3 grid grid-cols-subgrid border-b border-white/5 pb-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    {models.map((model, side) => (
                        <span key={side} className={`${TYPE.number} text-right`} style={{ color: SIDES[side] }}>
                            {read(model)}
                        </span>
                    ))}
                </div>
            ))}
        </section>
    )
}

export default function CompareView({ onOpen }: ViewProps) {
    const loaded = useHeard()
    const [ids, setIds] = useState([MODELS[0].id, MODELS[Math.min(2, MODELS.length - 1)].id])
    const heard = loaded instanceof Error ? undefined : loaded
    useEffect(() => {
        const query = new URLSearchParams(location.search)
        const asked = [query.get('a'), query.get('b')]
        setIds(previous => previous.map((id, side) => (MODELS.some(model => model.id === asked[side]) ? asked[side]! : id)))
    }, [])
    function choose(side: number, id: string): void {
        const next = ids.map((existing, index) => (index === side ? id : existing))
        setIds(next)
        history.replaceState(null, '', `?a=${next[0]}&b=${next[1]}`)
    }
    if (loaded instanceof Error) return <p className="p-8 text-sm text-muted-foreground">The results couldn't be loaded. Try again in a moment.</p>
    if (!heard) return <Loading />
    const models = ids.map(summary)
    const runs = ids.map(id => heard.runs[heard.models.indexOf(id)])
    return (
        <div className="h-full overflow-y-auto" style={{ background: INK.background }}>
            <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-4 sm:px-8">
                <div className="grid gap-6 sm:grid-cols-2">
                    {ids.map((id, side) => (
                        <Picker key={side} side={side} id={id} onChange={chosen => choose(side, chosen)} />
                    ))}
                </div>
                <Areas models={models} />
                <Speakers heard={heard} models={models} />
                <Waits runs={runs} />
                <Misses heard={heard} runs={runs} ids={ids} onOpen={onOpen} />
                <Facts models={models} />
            </div>
        </div>
    )
}
