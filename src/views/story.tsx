/**
 * The story of the recordings: every word of the script, as every model heard it from every speaker,
 * as a point of light, rearranged as you scroll from the script itself, through the models, the
 * speakers, the mistakes and the waits, to the models worth running. Ends with the ranking.
 */
import { BENCH, MODELS, type ModelSummary, SAMPLE, percent, seconds } from '@site/data'
import facts from '@site/facts.json'
import { type Heard, OUTCOMES, hearingSentence, listenQuery, scriptFor, shortName, speakerName, useHeard } from '@site/heard'
import { type Scene, type Space, Story, type Step } from '@site/kit/story'
import { TYPE } from '@site/kit/theme'
import { type Layouts, PALETTE, makeLayouts } from '@site/views/story/layouts'
import { type ReactNode, useMemo } from 'react'

/** Word errors at or under this earn full marks for accuracy, and at or over this earn none (bench/voice-score.ts). */
const FULL_MARKS = 0.02
const NO_MARKS = 0.15

/** "A", "A and B", "A, B and C". */
const list = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const share = (part: number, whole: number): string => `${Math.round((part / whole) * 100)}%`
const speakerNumber = (id: string): string => speakerName(id).replace('Speaker ', '')

function Key() {
    return (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {Object.values(OUTCOMES).map(item => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: item.color }} />
                    {item.label}
                </span>
            ))}
        </p>
    )
}

/** What the published numbers say, worked out once for the captions. */
function findings() {
    const best = MODELS[0]
    const rate = (model: ModelSummary): number => model.wordErrorRate ?? 1
    const leaders = MODELS.filter(model => model.score === best.score)
    const mistakes = facts.wrong + facts.dropped + facts.added
    const worst = facts.worstWords[0]
    const swaps = facts.worstWords
        .flatMap(word => (word.instead && word.instead.times > word.dropped ? [{ ...word, instead: word.instead }] : []))
        .sort((first, second) => second.instead.times - first.instead.times)
        .slice(0, 3)
    const waits = facts.waits.map(wait => ({ ...wait, model: MODELS.find(model => model.id === wait.id)! }))
    const slowest = [...waits].sort((first, second) => first.withinTarget / first.lines - second.withinTarget / second.lines)[0]
    const byMemory = [...MODELS].sort((first, second) => (first.peakMemoryGigabytes ?? Infinity) - (second.peakMemoryGigabytes ?? Infinity))
    return {
        best,
        leaders,
        /** The best model anyone may ship in a product. */
        commercial: MODELS.find(model => !model.licence?.includes('NC')),
        accurate: MODELS.filter(model => rate(model) < FULL_MARKS),
        lost: MODELS.filter(model => rate(model) >= NO_MARKS),
        mistakes,
        worst,
        swaps,
        easiest: [...facts.speakers].sort((first, second) => second.flawless - first.flawless)[0],
        neverFlawless: facts.speakers.filter(speaker => speaker.flawless === 0),
        slowest,
        streaming: MODELS.filter(model => model.mode === 'streaming'),
        lightest: byMemory.find(model => (model.score ?? 0) >= (best.score ?? 0) - 2),
        hungriest: byMemory[byMemory.length - 1],
    }
}

function steps(layouts: Layouts | undefined): Step[] {
    const picture = (draw: (made: Layouts) => (space: Space) => Scene) => (space: Space) => draw(layouts!)(space)
    const found = findings()
    return [
        {
            id: 'script',
            kicker: 'Voicebench',
            title: `${facts.scriptLines} lines, as ${MODELS.length} speech models heard them`,
            body: (
                <>
                    <p>
                        {SAMPLE.speakers} people read one script into their phones. Under each word is every time {MODELS.length} open speech models heard it: the more colour, the more often it
                        went wrong.
                    </p>
                </>
            ),
            extra: <Key />,
            scene: picture(made => made.script),
        },
        {
            id: 'models',
            kicker: 'By model',
            title: 'Most models hear almost every word',
            body: (
                <>
                    <p>Each row is a model, best at the top, with every word of the script from each speaker in turn.</p>
                    <p>
                        {found.accurate.length} of {MODELS.length} get fewer than {FULL_MARKS * 100} words in 100 wrong.
                        {found.lost.length > 0 && ` The bands of colour at the bottom are ${list(found.lost.map(shortName))}: ${list(found.lost.map(model => percent(model.wordErrorRate, 0)))} wrong.`}
                    </p>
                </>
            ),
            scene: picture(made => made.byModel),
        },
        {
            id: 'speakers',
            kicker: 'By speaker',
            title: 'Some recordings are harder for every model',
            body: (
                <>
                    <p>Each column is one person's recording: the script top to bottom, the models left to right.</p>
                    <p>
                        A streak across is a word nearly every model missed, often because the speaker said it differently. {found.easiest.flawless} models heard every word from{' '}
                        {speakerName(found.easiest.id)}
                        {found.neverFlawless.length > 0 ? `; none got all of ${found.neverFlawless.length === 1 ? 'speaker' : 'speakers'} ${list(found.neverFlawless.map(speaker => speakerNumber(speaker.id)))}.` : '.'}
                    </p>
                </>
            ),
            scene: picture(made => made.bySpeaker),
        },
        {
            id: 'mistakes',
            kicker: 'The mistakes',
            title: 'Small words go missing, sound-alikes swap',
            watermark: 'Misheard',
            body: (
                <>
                    <p>
                        Only the mistakes now, gathered by the word that was missed. Of every 100, {Math.round((facts.wrong / found.mistakes) * 100)} are a wrong word,{' '}
                        {Math.round((facts.dropped / found.mistakes) * 100)} a dropped word and {Math.round((facts.added / found.mistakes) * 100)} a word nobody said.
                    </p>
                    <p>
                        The largest is “{found.worst.text.toLowerCase()}” in “{found.worst.phrase}”, dropped {found.worst.dropped} times in {found.worst.total}.
                        {found.swaps.length > 0 && ` ${list(found.swaps.slice(0, 2).map(word => `“${word.text.toLowerCase()}” became “${word.instead.text}” ${word.instead.times} times`))}.`}
                    </p>
                </>
            ),
            scene: picture(made => made.mistakes),
        },
        {
            id: 'waits',
            kicker: 'The wait',
            title: 'Most answer before you would notice',
            body: (
                <>
                    <p>
                        Every word again, placed by how long its line's text took to arrive. Under a second feels instant, and {facts.alwaysWithinTarget} of {MODELS.length} models never took
                        longer.
                    </p>
                    <p>
                        {shortName(found.slowest.model)} took a second or more on {share(found.slowest.lines - found.slowest.withinTarget, found.slowest.lines)} of lines.
                        {found.streaming.length > 0 && ` The shaded ${found.streaming.length === 1 ? 'row listens' : 'rows listen'} while you speak, and ${found.streaming.length === 1 ? 'trails' : 'trail'} by ${list(found.streaming.map(model => seconds(model.latencyMedianMs)))}.`}
                    </p>
                </>
            ),
            scene: picture(made => made.waits),
        },
        {
            id: 'memory',
            kicker: 'Memory',
            title: 'More memory does not buy better hearing',
            body: (
                <>
                    <p>Each column is a model, from the least memory used to the most, with its words stacked: heard right at the bottom, mistakes on top.</p>
                    {found.lightest && (
                        <p>
                            {shortName(found.lightest)} runs in {found.lightest.peakMemoryGigabytes?.toFixed(1)} GB and scores {found.lightest.score}. {shortName(found.hungriest)} needs{' '}
                            {found.hungriest.peakMemoryGigabytes?.toFixed(0)} GB and gets {percent(found.hungriest.wordErrorRate)} of words wrong.
                        </p>
                    )}
                </>
            ),
            scene: picture(made => made.byMemory),
        },
        {
            id: 'field',
            kicker: 'The field',
            title: 'The ones worth running',
            body: (
                <>
                    <p>Each model's words gather into one light. Higher is fewer mistakes, further left is less waiting.</p>
                    <p>
                        {list(found.leaders.map(shortName))} {found.leaders.length === 1 ? 'leads' : 'lead'} with {found.best.score}.
                        {found.commercial &&
                            found.commercial !== found.best &&
                            ` ${found.leaders.length === 1 ? 'It is' : 'Both are'} for non-commercial use only: the best you can ship in a product is ${shortName(found.commercial)}, at ${found.commercial.score}.`}
                    </p>
                </>
            ),
            scene: picture(made => made.field),
        },
    ]
}

/** What one point is, for the card beside it. */
function HearingTip({ heard, layouts, index }: { heard: Heard; layouts: Layouts; index: number }) {
    const hearing = layouts.describe(index)
    const model = MODELS.find(candidate => candidate.id === heard.models[hearing.model])!
    const speaker = heard.speakers[hearing.speaker]
    const word = heard.words[hearing.word]
    const result = OUTCOMES[hearing.outcome]
    return (
        <>
            <p className="font-heading text-sm leading-snug font-semibold">{shortName(model)}</p>
            <p className="text-xs text-muted-foreground">
                {speakerName(speaker.id)} · line {word.line + 1} · {hearing.wait === null ? 'no text' : seconds(hearing.wait)}
            </p>
            <p className="line-clamp-3 text-xs leading-relaxed text-foreground/80">“{scriptFor(heard, speaker.utterances[hearing.utterance]) || heard.lines[word.line]}”</p>
            <p className="text-xs font-medium" style={{ color: result.color }}>
                {hearingSentence(hearing.outcome, word.text, hearing.heard)}
            </p>
        </>
    )
}

export function StoryView({ onOpen }: { onOpen: (tab: string, query?: string) => void }) {
    const loaded = useHeard()
    const heard = loaded instanceof Error ? undefined : loaded
    const layouts = useMemo(() => (heard ? makeLayouts(heard) : undefined), [heard])
    const story = useMemo(() => steps(layouts), [layouts])

    function tip(index: number): ReactNode {
        return heard && layouts ? <HearingTip heard={heard} layouts={layouts} index={index} /> : null
    }

    function open(index: number): void {
        if (!heard || !layouts) return
        const hearing = layouts.describe(index)
        onOpen('listen', listenQuery(heard.speakers[hearing.speaker].id, heard.models[hearing.model], hearing.utterance))
    }

    return (
        <Story count={layouts?.count ?? 0} palette={PALETTE} steps={story} tip={tip} onSelect={open}>
            <Ranking onOpen={onOpen} />
        </Story>
    )
}

/** Every model, best first, as plain links: the end of the story and the way in to each model's own page. */
function Ranking({ onOpen }: { onOpen: (tab: string) => void }) {
    return (
        <section className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-4 pb-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className={TYPE.label}>The ranking</p>
                    <h2 className={TYPE.title}>Every model, best first</h2>
                </div>
                <div className="flex gap-4 text-sm">
                    <a
                        href={`${BENCH.path}listen/`}
                        onClick={event => {
                            event.preventDefault()
                            onOpen('listen')
                        }}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                        Listen to the recordings →
                    </a>
                </div>
            </div>
            <ol className="grid gap-x-10 sm:grid-cols-2">
                {MODELS.map((model, index) => (
                    <li key={model.id} className="border-b border-white/5">
                        <a href={`${BENCH.path}${model.id}/`} className="group grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 py-2.5">
                            <span className={`${TYPE.number} text-xs text-muted-foreground`}>{index + 1}</span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium group-hover:underline">{model.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {model.maker} · {percent(model.wordErrorRate)} word errors · {seconds(model.latencyMedianMs)} typical wait
                                </span>
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-white/10 sm:block">
                                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${model.score ?? 0}%` }} />
                                </span>
                                <span className={`${TYPE.number} w-7 text-right text-sm font-semibold`}>{model.score ?? '–'}</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ol>
        </section>
    )
}
