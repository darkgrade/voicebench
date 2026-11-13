/**
 * One model's own page: its score, every word it heard as points of light, its transcript of each
 * speaker line by line with the recording, where it stands in the field, every wait, and the words
 * it gets wrong most. Everything but the lights is in the prerendered page.
 */
import { Badge } from '@kevinschaich/components'
import { BENCH, MODELS, type ModelDetail, type ModelSummary, RUN, percent, seconds } from '@site/data'
import facts from '@site/facts.json'
import { OUTCOMES, shortName, speakerName } from '@site/heard'
import { INK, TONE, TYPE } from '@site/kit/theme'
import { Hear, type HeardSpeaker } from '@site/pages/model/hear'
import { Lights } from '@site/pages/model/lights'
import { SCRIPT } from '@site/script'
import { type Step, placeSteps, writtenLine } from '@site/spoken'
import { scaleLog } from 'd3-scale'

const TARGET = 1000
const FASTEST = 20
const SLOWEST = 5000
const spokenStarts: Record<string, number[]> = facts.spokenStarts

/** One speaker's recording as this model heard it: each step of the alignment, and each spoken line. */
interface Recording extends HeardSpeaker {
    steps: Step[]
}

function recordings(detail: ModelDetail): Recording[] {
    return detail.speakers.map(speaker => {
        const steps = placeSteps(speaker.alignment, speaker.utterances, spokenStarts[speaker.speaker] ?? [])
        return {
            id: speaker.speaker,
            seconds: RUN.input?.speakers?.find(candidate => candidate.id === speaker.speaker)?.audioSeconds ?? speaker.utterances[speaker.utterances.length - 1].endSeconds,
            wordErrorRate: speaker.wordErrorRate,
            errors: speaker.errors,
            steps,
            lines: speaker.utterances.map((utterance, index) => ({
                start: utterance.startSeconds,
                end: utterance.endSeconds,
                said: writtenLine(utterance.text, utterance.latencyMs, steps.filter(step => step.utterance === index)),
            })),
        }
    })
}

function ScoreRing({ score }: { score: number | null | undefined }) {
    const around = 2 * Math.PI * 52
    return (
        <div className="relative size-32 shrink-0 sm:size-40">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="7" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={INK.accent} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${((score ?? 0) / 100) * around} ${around}`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`${TYPE.number} text-4xl font-semibold sm:text-5xl`}>{score ?? '–'}</span>
                <span className="text-xs text-muted-foreground">out of 100</span>
            </div>
        </div>
    )
}

function Reading({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className={TYPE.label}>{label}</dt>
            <dd className={`${TYPE.number} text-xl font-semibold`}>{value}</dd>
            {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
        </div>
    )
}

function Heading({ label, title }: { label: string; title: string }) {
    return (
        <div>
            <p className={TYPE.label}>{label}</p>
            <h2 className={TYPE.title}>{title}</h2>
        </div>
    )
}

/** Every model by word errors and typical wait, with this one lit. */
function Standing({ model }: { model: ModelSummary }) {
    const width = 640
    const height = 300
    const rates = MODELS.map(other => other.wordErrorRate ?? 1)
    const waits = MODELS.map(other => other.latencyMedianMs ?? SLOWEST)
    const x = scaleLog().domain([Math.min(...waits) * 0.75, Math.max(...waits, TARGET) * 1.2]).range([44, width - 16])
    const y = scaleLog().domain([Math.min(...rates) * 0.7, Math.max(...rates) * 1.3]).range([14, height - 30])
    const place = (other: ModelSummary): [number, number] => [x(other.latencyMedianMs ?? SLOWEST), y(other.wordErrorRate ?? 1)]
    const [ownX, ownY] = place(model)
    const [low, high] = y.domain()
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${model.name} among every model, by word errors and typical wait`}>
            {[50, 100, 250, 500, TARGET].map(tick => (
                <g key={tick}>
                    <line x1={x(tick)} x2={x(tick)} y1={14} y2={height - 30} stroke={tick === TARGET ? INK.accent : INK.grid} strokeDasharray={tick === TARGET ? '2 4' : undefined} />
                    <text x={x(tick)} y={height - 12} textAnchor="middle" fontSize={11} fill={tick === TARGET ? INK.accent : INK.muted}>
                        {tick / 1000} s
                    </text>
                </g>
            ))}
            {[0.01, 0.02, 0.05, 0.1, 0.2, 0.4]
                .filter(tick => tick > low && tick < high)
                .map(tick => (
                    <g key={tick}>
                        <line x1={44} x2={width - 16} y1={y(tick)} y2={y(tick)} stroke={INK.grid} />
                        <text x={38} y={y(tick) + 4} textAnchor="end" fontSize={11} fill={INK.muted}>
                            {Math.round(tick * 100)}%
                        </text>
                    </g>
                ))}
            {MODELS.filter(other => other.id !== model.id).map(other => {
                const [otherX, otherY] = place(other)
                return (
                    <a key={other.id} href={`${BENCH.path}${other.id}/`}>
                        <title>{other.name}</title>
                        <circle cx={otherX} cy={otherY} r={5} fill={TONE.good} fillOpacity={0.28} stroke={TONE.good} strokeOpacity={0.5} />
                    </a>
                )
            })}
            <circle cx={ownX} cy={ownY} r={16} fill={INK.accent} fillOpacity={0.18} />
            <circle cx={ownX} cy={ownY} r={7} fill={INK.accent} />
            <text x={ownX > width - 200 ? ownX - 14 : ownX + 14} y={ownY > 40 ? ownY - 12 : ownY + 24} textAnchor={ownX > width - 200 ? 'end' : 'start'} fontSize={12} fontWeight={600} fill={INK.text}>
                {shortName(model)}
            </text>
        </svg>
    )
}

/** The median of the field's score in one area, to mark on this model's bar. */
function fieldMedian(area: string): number {
    const scores = MODELS.flatMap(other => other.reasons?.filter(reason => reason.area === area).map(reason => reason.score) ?? []).sort((first, second) => first - second)
    return scores[Math.floor(scores.length / 2)] ?? 0
}

/** Every wait, one dot per spoken line, with the one-second target marked. */
function Waits({ heard }: { heard: Recording[] }) {
    const width = 640
    const height = 150
    const waits = heard.flatMap((speaker, speakerIndex) => speaker.lines.map((line, index) => ({ wait: line.said.wait, speaker: speakerIndex, index })))
    const timed = waits.flatMap(item => (item.wait === null ? [] : [Math.min(SLOWEST, Math.max(FASTEST, item.wait))]))
    const x = scaleLog().domain([Math.min(...timed, 50) * 0.7, Math.max(...timed, TARGET) * 1.4]).range([12, width - 60])
    const [low, high] = x.domain()
    const silent = waits.filter(item => item.wait === null).length
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="How long each spoken line's text took to arrive">
            {[50, 100, 250, 500, TARGET, 2500].filter(tick => tick > low && tick < high).map(tick => (
                <g key={tick}>
                    <line x1={x(tick)} x2={x(tick)} y1={8} y2={height - 26} stroke={tick === TARGET ? INK.accent : INK.grid} strokeDasharray={tick === TARGET ? '2 4' : undefined} />
                    <text x={x(tick)} y={height - 8} textAnchor="middle" fontSize={11} fill={tick === TARGET ? INK.accent : INK.muted}>
                        {tick / 1000} s
                    </text>
                </g>
            ))}
            {waits.map(item => (
                <circle
                    key={`${item.speaker}-${item.index}`}
                    cx={item.wait === null ? width - 24 : x(Math.min(SLOWEST, Math.max(FASTEST, item.wait)))}
                    cy={14 + ((item.index * 7 + item.speaker * 13) % 17) * ((height - 46) / 16)}
                    r={3}
                    fill={item.wait === null || item.wait >= TARGET ? TONE.bad : TONE.good}
                    fillOpacity={0.55}
                />
            ))}
            {silent > 0 && (
                <text x={width - 24} y={height - 8} textAnchor="middle" fontSize={11} fill={INK.muted}>
                    no text
                </text>
            )}
        </svg>
    )
}

/** The script words this model missed for the most speakers, with what it wrote instead. */
function missedMost(heard: Recording[]) {
    const tallies = new Map<number, { word: number; speakers: number; dropped: number; instead: Map<string, number> }>()
    for (const speaker of heard) {
        for (const step of speaker.steps) {
            if (step.kind !== 'missed' && step.kind !== 'substituted') continue
            const tally = tallies.get(step.word) ?? { word: step.word, speakers: 0, dropped: 0, instead: new Map<string, number>() }
            tally.speakers++
            if (step.kind === 'missed') tally.dropped++
            else tally.instead.set(step.heard!, (tally.instead.get(step.heard!) ?? 0) + 1)
            tallies.set(step.word, tally)
        }
    }
    return [...tallies.values()].sort((first, second) => second.speakers - first.speakers || first.word - second.word).slice(0, 10)
}

export function ModelPage({ model, detail }: { model: ModelSummary; detail: ModelDetail | undefined }) {
    const rank = MODELS.indexOf(model) + 1
    const previous = MODELS[rank - 2]
    const next = MODELS[rank]
    const rival = next ?? previous
    const heard = detail ? recordings(detail) : []
    const missed = missedMost(heard)
    return (
        <article className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-6 sm:px-8 sm:py-8">
            <header className="flex flex-col gap-6">
                <a href={BENCH.path} className="text-sm text-muted-foreground hover:underline">
                    ← All models
                </a>
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <div className="flex min-w-0 flex-col gap-3">
                        <p className={TYPE.label}>
                            {model.maker} · #{rank} of {MODELS.length} models
                        </p>
                        <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{model.name}</h1>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {model.licence && <Badge variant="secondary">{model.licence}</Badge>}
                            {model.mode && <Badge variant="outline">{model.mode}</Badge>}
                            {model.strengths?.map(strength => (
                                <Badge key={strength} variant="outline">
                                    {strength}
                                </Badge>
                            ))}
                            {model.weaknesses?.map(weakness => (
                                <Badge key={weakness} variant="outline" className="text-muted-foreground">
                                    {weakness}
                                </Badge>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                            <a href={`${BENCH.path}listen/?model=${model.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                                Listen along with every model →
                            </a>
                            {rival && (
                                <a href={`${BENCH.path}compare/?a=${model.id}&b=${rival.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                                    Compare with {shortName(rival)} →
                                </a>
                            )}
                        </div>
                    </div>
                    <ScoreRing score={model.score} />
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-white/8 py-5 sm:grid-cols-3 lg:grid-cols-6">
                    <Reading label="Word errors" value={percent(model.wordErrorRate)} sub={model.errors ? `${model.errors.substitutions} wrong · ${model.errors.deletions} dropped · ${model.errors.insertions} added` : undefined} />
                    <Reading label="Typical wait" value={seconds(model.latencyMedianMs)} sub={`slow: ${seconds(model.latencyP90Ms)}`} />
                    <Reading label="Under a second" value={percent(model.withinTarget, 0)} sub={`longest: ${seconds(model.latencyMaxMs)}`} />
                    <Reading label="Download" value={model.sizeGigabytes ? `${model.sizeGigabytes.toFixed(2)} GB` : '–'} />
                    <Reading label="Memory used" value={model.peakMemoryGigabytes ? `${model.peakMemoryGigabytes.toFixed(1)} GB` : '–'} />
                    <Reading label="Load time" value={model.loadSeconds !== undefined ? `${model.loadSeconds} s` : '–'} />
                </dl>
            </header>

            {heard.length > 0 && (
                <section className="flex flex-col gap-4">
                    <Heading label="Every word" title="What it heard, word by word" />
                    <Lights script={SCRIPT} rows={heard} />
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {Object.values(OUTCOMES).map(item => (
                            <span key={item.label} className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full" style={{ background: item.color }} />
                                {item.label}
                            </span>
                        ))}
                        <span>Each row is a speaker reading the script from left to right.</span>
                    </p>
                </section>
            )}

            {heard.length > 0 && (
                <section className="flex flex-col gap-4">
                    <Heading label="Hear it" title="What it wrote, line by line" />
                    <Hear model={model} script={SCRIPT.words} speakers={heard} />
                </section>
            )}

            <section className="grid gap-10 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                    <Heading label="The field" title="Where it stands" />
                    <Standing model={model} />
                    <p className="text-xs text-muted-foreground">Every model by word errors and typical wait. Higher and further left is better.</p>
                </div>
                {model.reasons && (
                    <div className="flex flex-col gap-4">
                        <Heading label="The score" title="How the score adds up" />
                        <div className="flex flex-col gap-3.5">
                            {model.reasons.map(reason => (
                                <div key={reason.area} className="grid grid-cols-[7.5rem_1fr_2.25rem] items-center gap-3 text-sm">
                                    <span className="text-muted-foreground">{reason.area}</span>
                                    <div className="flex flex-col gap-1">
                                        <div className="relative h-2 rounded-full bg-white/8">
                                            <div className="h-full rounded-full" style={{ width: `${reason.score}%`, background: INK.accent }} />
                                            <span className="absolute -top-1 h-4 w-px bg-white/60" style={{ left: `${fieldMedian(reason.area)}%` }} />
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {reason.why} · counts {reason.weight}%
                                        </span>
                                    </div>
                                    <span className={`${TYPE.number} text-right`}>{reason.score}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">The tick on each bar is the middle of the field.</p>
                    </div>
                )}
            </section>

            {heard.length > 0 && (
                <section className="grid gap-10 lg:grid-cols-2">
                    <div className="flex flex-col gap-4">
                        <Heading label="The wait" title="Every line's wait" />
                        <Waits heard={heard} />
                        <p className="text-xs text-muted-foreground">One dot per spoken line: how long after the speaker stopped its text arrived.</p>
                    </div>
                    <div className="flex flex-col gap-4">
                        <Heading label="The mistakes" title="The words it missed most" />
                        {missed.length === 0 && <p className="text-sm text-muted-foreground">It heard every word of the script from every speaker.</p>}
                        <ol className="flex flex-col">
                            {missed.map(item => {
                                const [instead] = [...item.instead.entries()].sort((first, second) => second[1] - first[1])
                                const word = SCRIPT.words[item.word]
                                return (
                                    <li key={item.word} className="border-t border-white/6">
                                        <a href={`${BENCH.path}words/?word=${word.token + 1}`} className="group flex items-baseline justify-between gap-3 py-2 text-sm">
                                            <span className="min-w-0 truncate">
                                                <span className="font-medium group-hover:underline">“{word.text}”</span>{' '}
                                                <span className="text-muted-foreground">{instead && instead[1] >= item.dropped ? `written as “${instead[0]}”` : 'dropped'}</span>
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                line {word.line + 1} · {item.speakers} of {heard.length} speakers
                                            </span>
                                        </a>
                                    </li>
                                )
                            })}
                        </ol>
                    </div>
                </section>
            )}

            <section className="flex flex-col gap-4">
                <Heading label="The run" title="How it ran" />
                <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                    <Reading label="Score" value={`${model.score ?? '–'} / 100`} sub={`#${rank} of ${MODELS.length} models`} />
                    <Reading label="Engine" value={model.engine ?? '–'} />
                    <Reading label="Speakers" value={String(heard.length)} sub={heard.map(speaker => `${speakerName(speaker.id).replace('Speaker ', '')}: ${percent(speaker.wordErrorRate)}`).join(' · ')} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <dt className={TYPE.label}>Model files</dt>
                        <dd className="text-sm">
                            <a href={model.source} className="break-all hover:underline">
                                {model.files?.map(file => file.name).join(', ') || model.source}
                            </a>
                        </dd>
                        <dd className="text-xs text-muted-foreground">{model.files?.map(file => `sha256 ${file.sha256.slice(0, 16)}…`).join(' · ')}</dd>
                    </div>
                </dl>
            </section>

            <nav className="grid grid-cols-2 gap-4 border-t border-white/8 pt-5 text-sm" aria-label="Other models">
                {previous ? (
                    <a href={`${BENCH.path}${previous.id}/`} className="group flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">← #{rank - 1}</span>
                        <span className="group-hover:underline">{previous.name}</span>
                    </a>
                ) : (
                    <span />
                )}
                {next && (
                    <a href={`${BENCH.path}${next.id}/`} className="group flex flex-col items-end gap-0.5 text-right">
                        <span className="text-xs text-muted-foreground">#{rank + 1} →</span>
                        <span className="group-hover:underline">{next.name}</span>
                    </a>
                )}
            </nav>
        </article>
    )
}
