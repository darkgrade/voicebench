/**
 * Words: the script typeset so that the words models stumble on stand out. Pick a word to see what
 * was written instead, and which models missed it for which speakers.
 */
import type { ViewProps } from '@site/app'
import { BENCH } from '@site/data'
import { type Heard, OUTCOMES, type Outcome, listenQuery, outcomeAt, shortName, spokenAt, summary, useHeard } from '@site/heard'
import { Loading } from '@site/kit/shell'
import { INK, TYPE } from '@site/kit/theme'
import { useEffect, useMemo, useState } from 'react'

/** How one written word of the script fared across every model and speaker. */
interface TokenTally {
    wrong: number
    dropped: number
    hearings: number
    /** What was written instead, most often first; '' stands for nothing at all. */
    instead: { text: string; times: number }[]
    /** By model, then speaker: the worst that happened to any part of the word. */
    grid: Outcome[][]
}

const SEVERITY: Outcome[] = ['right', 'wrong', 'dropped']

function tally(heard: Heard): TokenTally[] {
    return heard.tokens.map(token => {
        const words = Array.from({ length: token.count }, (_, offset) => token.first + offset)
        const instead = new Map<string, number>()
        let wrong = 0
        let dropped = 0
        const grid = heard.runs.map(bySpeaker =>
            bySpeaker.map(run => {
                const outcomes = words.map(word => outcomeAt(run, word))
                wrong += outcomes.filter(outcome => outcome === 'wrong').length
                dropped += outcomes.filter(outcome => outcome === 'dropped').length
                run.heard.forEach(([word, text]) => words.includes(word) && instead.set(text, (instead.get(text) ?? 0) + 1))
                return outcomes.reduce((worst, outcome) => (SEVERITY.indexOf(outcome) > SEVERITY.indexOf(worst) ? outcome : worst), 'right')
            })
        )
        if (dropped) instead.set('', dropped)
        return {
            wrong,
            dropped,
            hearings: words.length * heard.models.length * heard.speakers.length,
            instead: [...instead.entries()].map(([text, times]) => ({ text, times })).sort((first, second) => second.times - first.times),
            grid,
        }
    })
}

const missed = (token: TokenTally): number => token.wrong + token.dropped

export default function WordsView({ onOpen }: ViewProps) {
    const loaded = useHeard()
    const heard = loaded instanceof Error ? undefined : loaded
    const tallies = useMemo(() => (heard ? tally(heard) : []), [heard])
    const worst = useMemo(() => tallies.reduce((best, token, index) => (missed(token) > missed(tallies[best]) ? index : best), 0), [tallies])
    const [picked, setPicked] = useState<number>()

    useEffect(() => {
        const asked = Number(new URLSearchParams(location.search).get('word'))
        if (asked >= 1) setPicked(asked - 1)
    }, [])

    if (loaded instanceof Error) return <p className="p-8 text-sm text-muted-foreground">The script couldn't be loaded. Try again in a moment.</p>
    if (!heard) return <Loading />
    const chosen = picked !== undefined && picked < tallies.length ? picked : worst
    const most = missed(tallies[worst]) / tallies[worst].hearings
    // The least-missed word is the plain one: sizes and colour grow from there.
    const least = Math.min(...tallies.map(token => missed(token) / token.hearings))

    function pick(token: number): void {
        setPicked(token)
        history.replaceState(null, '', `?word=${token + 1}`)
    }

    return (
        <div className="flex h-full flex-col lg:flex-row" style={{ background: INK.background }}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [--word-scale:0.72] sm:px-8 sm:[--word-scale:1]">
                <p className={`${TYPE.label} pb-4`}>The larger and redder a word, the more often it was missed. Pick one.</p>
                <ol className="flex flex-col gap-3 sm:gap-4">
                    {heard.lines.map((_, line) => (
                        <li key={line} className="grid grid-cols-[1.5rem_1fr] items-baseline gap-2">
                            <span className={`${TYPE.number} text-xs text-muted-foreground`}>{line + 1}</span>
                            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:gap-x-3">
                                {heard.tokens.map((token, index) => {
                                    if (token.line !== line) return null
                                    const share = Math.max(0, (missed(tallies[index]) / tallies[index].hearings - least) / (most - least))
                                    const color = tallies[index].dropped > tallies[index].wrong ? OUTCOMES.dropped.color : OUTCOMES.wrong.color
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => pick(index)}
                                            className={`cursor-pointer rounded-md px-1 font-heading leading-tight font-semibold tracking-tight transition-colors hover:bg-white/10 ${index === chosen ? 'bg-white/10 ring-1 ring-white/40' : ''}`}
                                            style={{ fontSize: `calc(${(1 + share * 1.9).toFixed(2)}rem * var(--word-scale, 1))`, color: `color-mix(in oklch, ${color} ${Math.round(Math.pow(share, 0.7) * 100)}%, ${INK.muted})` }}
                                        >
                                            {token.text}
                                        </button>
                                    )
                                })}
                            </p>
                        </li>
                    ))}
                </ol>
            </div>
            <aside className="h-[48%] shrink-0 overflow-y-auto border-t border-white/10 px-4 py-4 sm:px-8 lg:h-auto lg:w-[27rem] lg:border-t-0 lg:border-l lg:px-6">
                <WordDetail heard={heard} token={chosen} tally={tallies[chosen]} onOpen={onOpen} />
            </aside>
        </div>
    )
}

function WordDetail({ heard, token, tally, onOpen }: { heard: Heard; token: number; tally: TokenTally; onOpen: ViewProps['onOpen'] }) {
    const written = heard.tokens[token]
    const most = Math.max(1, ...tally.instead.map(item => item.times))
    const before = heard.tokens.filter((other, index) => other.line === written.line && index < token).map(other => other.text)
    const after = heard.tokens.filter((other, index) => other.line === written.line && index > token).map(other => other.text)

    function listen(model: number, speaker: number): void {
        const run = heard.runs[model][speaker]
        onOpen('listen', listenQuery(heard.speakers[speaker].id, heard.models[model], spokenAt(run, written.first)))
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
                <p className={TYPE.label}>Line {written.line + 1}</p>
                <p className="text-sm text-muted-foreground">
                    {before.join(' ')} <span className="font-semibold text-foreground">{written.text}</span> {after.join(' ')}
                </p>
                <p className={`${TYPE.display} pt-2`}>{written.text.replace(/[.,?!]+$/, '')}</p>
                <p className="text-sm text-muted-foreground">
                    {missed(tally) ? `Missed ${missed(tally)} times in ${tally.hearings}: ${tally.wrong} as another word, ${tally.dropped} dropped.` : `Heard right all ${tally.hearings} times.`}
                </p>
            </div>
            {tally.instead.length > 0 && (
                <section className="flex flex-col gap-1.5">
                    <p className={TYPE.label}>What was written instead</p>
                    {tally.instead.slice(0, 8).map(item => (
                        <div key={item.text} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
                            <span className="truncate" style={{ color: item.text ? OUTCOMES.wrong.color : OUTCOMES.dropped.color }}>
                                {item.text ? `“${item.text}”` : 'nothing'}
                            </span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
                                <span className="block h-full rounded-full" style={{ width: `${(item.times / most) * 100}%`, background: item.text ? OUTCOMES.wrong.color : OUTCOMES.dropped.color }} />
                            </span>
                            <span className={`${TYPE.number} text-right text-xs text-muted-foreground`}>{item.times}</span>
                        </div>
                    ))}
                    {tally.instead.length > 8 && <p className="text-xs text-muted-foreground">and {tally.instead.length - 8} other words, once or twice each</p>}
                </section>
            )}
            <section className="flex flex-col gap-1.5">
                <p className={TYPE.label}>Who missed it, speaker by speaker</p>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
                    <span />
                    <div className="grid grid-cols-8 gap-1">
                        {heard.speakers.map((_, speaker) => (
                            <span key={speaker} className={`${TYPE.number} w-4 text-center text-[10px] text-muted-foreground`}>
                                {speaker + 1}
                            </span>
                        ))}
                    </div>
                    {heard.models.map((id, model) => (
                        <Row key={id} name={shortName(summary(id))} href={`${BENCH.path}${id}/`} outcomes={tally.grid[model]} onListen={speaker => listen(model, speaker)} />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Pick a square to hear that speaker say the line, with what the model wrote.</p>
            </section>
        </div>
    )
}

function Row({ name, href, outcomes, onListen }: { name: string; href: string; outcomes: Outcome[]; onListen: (speaker: number) => void }) {
    return (
        <>
            <a href={href} className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline">
                {name}
            </a>
            <div className="grid grid-cols-8 gap-1">
                {outcomes.map((outcome, speaker) => (
                    <button
                        key={speaker}
                        onClick={() => onListen(speaker)}
                        aria-label={`${name}, speaker ${speaker + 1}: ${OUTCOMES[outcome].label}`}
                        className="size-4 cursor-pointer rounded-[3px] hover:ring-1 hover:ring-white"
                        style={{ background: OUTCOMES[outcome].color, opacity: outcome === 'right' ? 0.22 : 1 }}
                    />
                ))}
            </div>
        </>
    )
}
