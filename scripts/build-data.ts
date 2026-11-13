/**
 * Joins the published results and recordings into the files the overview's views load:
 *
 *  - public/data/heard.json: the script word by word, and for every model and speaker how each word
 *    was heard, which spoken line it fell in, what the model wrote for that line and how long it took.
 *  - public/data/waves.json: each recording's loudness over time, so a waveform can be drawn before
 *    any audio is loaded.
 *  - public/data/audio/speaker-NN.wav: the published recordings, copied as they are.
 *  - src/facts.json: the few tallies the story's captions quote, small enough to bundle and prerender.
 *
 * Runs before `vite` and `vite build`; none of these files is committed. Only speakers listed in
 * results/voicebench.json are read, and nothing about a speaker is added.
 */
import { normalise } from '@bench/scoring'
import { type Aligned, placeSteps, readScript, writtenLine, writtenOwners } from '@site/spoken'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface ModelRow {
    id: string
    name: string
    error?: string
    wordErrorRate?: number
    mode?: string
}

interface RecordedUtterance {
    startSeconds: number
    endSeconds: number
    text: string
    latencyMs: number | null
}

interface RecordedSpeaker {
    speaker: string
    alignment: Aligned[]
    utterances: RecordedUtterance[]
}

const ROOT = resolve(import.meta.dirname, '..')
const OUTPUT = join(ROOT, 'public', 'data')
const WAVE_BUCKETS_PER_SECOND = 25
const read = <T>(...path: string[]): T => JSON.parse(readFileSync(join(ROOT, ...path), 'utf8')) as T
const median = (values: number[]): number => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)]

const results = read<{ models: ModelRow[]; input: { speakers: { id: string; file: string; audioSeconds: number }[] } }>('results', 'voicebench.json')
const models = results.models.filter(model => !model.error && model.wordErrorRate !== undefined)
const speakers = results.input.speakers

/** The script: its lines as written, each written word, and the words models are scored on. */
const { lines, tokens, words } = readScript(readFileSync(join(ROOT, 'script', 'reading-script.md'), 'utf8'))
/** The first scored word of each script line. */
const lineStarts = lines.map((_, line) => words.findIndex(word => word.line === line))
const reference = normalise(lines.join(' '))
if (reference.length !== words.length) throw new Error(`the script scores as ${reference.length} words but splits into ${words.length}`)

const details = models.map(model => read<{ speakers: RecordedSpeaker[] }>('results', 'models', `${model.id}.json`))
const recorded = (model: number, speaker: number): RecordedSpeaker => {
    const found = details[model].speakers.find(candidate => candidate.speaker === speakers[speaker].id)
    if (!found) throw new Error(`${models[model].id} has no result for ${speakers[speaker].id}`)
    return found
}

/** The script words each of a speaker's spoken lines covers, as most models heard them: the first word of each. */
function spokenStarts(speaker: number): number[] {
    const count = recorded(0, speaker).utterances.length
    const firsts: number[][] = Array.from({ length: count }, () => [])
    models.forEach((_, model) => {
        const { alignment, utterances } = recorded(model, speaker)
        const owner = writtenOwners(utterances)
        const first = new Array<number | undefined>(count).fill(undefined)
        let word = 0
        let heard = 0
        for (const step of alignment) {
            if (step.kind === 'same' || step.kind === 'substituted') first[owner[heard]] ??= word
            if (step.kind !== 'missed') heard++
            if (step.kind !== 'added') word++
        }
        first.forEach((value, utterance) => value !== undefined && firsts[utterance].push(value))
    })
    const heardStarts = firsts.map(values => (values.length ? median(values) : undefined))
    // People pause between the script's lines, so a spoken line that starts a word or two into a
    // script line (its first word dropped by most models) starts with that line.
    const distance = (start: number | undefined, to: number): number => (start === undefined ? Infinity : Math.abs(start - to))
    const starts = heardStarts.map((start, utterance) => {
        if (start === undefined) return undefined
        const lineStart = lineStarts.reduce((best, candidate) => (Math.abs(candidate - start) < Math.abs(best - start) ? candidate : best))
        if (Math.abs(lineStart - start) > 2) return start
        const closest = Math.min(...heardStarts.map(other => distance(other, lineStart)))
        return heardStarts.findIndex(other => distance(other, lineStart) === closest) === utterance ? lineStart : start
    })
    // A spoken line no model heard script words in covers nothing; the rest must run in order.
    const filled = new Array<number>(count)
    let next = words.length
    for (let utterance = count - 1; utterance >= 0; utterance--) {
        next = Math.min(next, starts[utterance] ?? next)
        filled[utterance] = next
    }
    filled[0] = 0
    return filled
}

const starts = speakers.map((_, speaker) => spokenStarts(speaker))
/** A model's alignment for one speaker, each step given its spoken line. */
function place(model: number, speaker: number) {
    const { alignment, utterances } = recorded(model, speaker)
    const heardCount = alignment.filter(step => step.kind !== 'missed').length
    if (writtenOwners(utterances).length !== heardCount) throw new Error(`${models[model].id} ${speakers[speaker].id}: written words and aligned words differ`)
    const scripted = alignment.filter((step): step is Exclude<Aligned, { kind: 'added' }> => step.kind !== 'added')
    if (scripted.some((step, word) => step.expected !== reference[word])) throw new Error(`${models[model].id} ${speakers[speaker].id}: alignment is not against this script`)
    return placeSteps(alignment, utterances, starts[speaker])
}

const KIND_LETTERS = { same: '.', substituted: 's', missed: 'm' } as const
const utteranceLetter = (utterance: number): string => String.fromCharCode(65 + utterance)

const runs = models.map((_, model) =>
    speakers.map((_, speaker) => {
        const steps = place(model, speaker)
        const scripted = steps.filter(step => step.kind !== 'added')
        return {
            /** Per script word: heard right, heard as another word, or dropped. */
            kinds: scripted.map(step => KIND_LETTERS[step.kind as keyof typeof KIND_LETTERS]).join(''),
            /** Per script word: the spoken line it fell in, as a letter (A is the first). */
            spoken: scripted.map(step => utteranceLetter(step.utterance)).join(''),
            /** Wrong words: the script word and what was written instead. */
            heard: scripted.filter(step => step.kind === 'substituted').map(step => [step.word, step.heard!]),
            /** Added words: the script word they came before, what was written, and the spoken line. */
            added: steps.filter(step => step.kind === 'added').map(step => [step.word, step.heard!, step.utterance]),
            said: recorded(model, speaker).utterances.map((utterance, index) => writtenLine(utterance.text, utterance.latencyMs, steps.filter(step => step.utterance === index))),
        }
    })
)

const heard = {
    models: models.map(model => model.id),
    lines,
    tokens,
    words,
    speakers: speakers.map((speaker, index) => {
        const utterances = recorded(0, index).utterances
        return {
            id: speaker.id,
            seconds: speaker.audioSeconds,
            utterances: utterances.map((utterance, position) => ({
                start: utterance.startSeconds,
                end: utterance.endSeconds,
                /** The script words this spoken line covers: first, and one past the last. */
                first: starts[index][position],
                last: starts[index][position + 1] ?? words.length,
            })),
        }
    }),
    runs,
}

/** A WAV's samples: 16-bit PCM, as the published recordings are. */
function samples(path: string): { rate: number; values: Int16Array } {
    const bytes = readFileSync(path)
    let offset = 12
    let rate = 0
    while (offset + 8 <= bytes.length) {
        const id = bytes.toString('ascii', offset, offset + 4)
        const size = bytes.readUInt32LE(offset + 4)
        if (id === 'fmt ') {
            if (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 10) !== 1 || bytes.readUInt16LE(offset + 22) !== 16) throw new Error(`${path}: expected 16-bit mono PCM`)
            rate = bytes.readUInt32LE(offset + 12)
        }
        if (id === 'data') return { rate, values: new Int16Array(bytes.buffer, bytes.byteOffset + offset + 8, Math.floor(size / 2)) }
        offset += 8 + size + (size % 2)
    }
    throw new Error(`${path}: no audio data`)
}

/** Loudness over time: the loudest sample in each slice, 0–100 against the recording's own loudest. */
function wave(path: string): number[] {
    const { rate, values } = samples(path)
    const slice = Math.round(rate / WAVE_BUCKETS_PER_SECOND)
    const peaks = Array.from({ length: Math.ceil(values.length / slice) }, (_, bucket) => {
        let peak = 0
        for (let index = bucket * slice; index < Math.min(values.length, (bucket + 1) * slice); index++) peak = Math.max(peak, Math.abs(values[index]))
        return peak
    })
    const loudest = Math.max(1, ...peaks)
    return peaks.map(peak => Math.round((peak / loudest) * 100))
}

mkdirSync(join(OUTPUT, 'audio'), { recursive: true })
const waves = { perSecond: WAVE_BUCKETS_PER_SECOND, speakers: Object.fromEntries(speakers.map(speaker => [speaker.id, wave(join(ROOT, 'recordings', speaker.file))])) }
for (const speaker of speakers) copyFileSync(join(ROOT, 'recordings', speaker.file), join(OUTPUT, 'audio', speaker.file))

/** Every hearing of every script word, for the tallies below. */
const hearings = runs.flatMap((bySpeaker, model) => bySpeaker.flatMap((run, speaker) => [...run.kinds].map((kind, word) => ({ model, speaker, word, kind }))))
const count = <T>(items: T[], matches: (item: T) => boolean): number => items.filter(matches).length
const addedCount = runs.flat().reduce((sum, run) => sum + run.added.length, 0)

/** How often each script word was heard wrong or dropped, and what was written most often instead. */
const wordTally = words.map((word, index) => {
    const mine = hearings.filter(hearing => hearing.word === index)
    const instead = new Map<string, number>()
    runs.flat().forEach(run => run.heard.forEach(([at, text]) => at === index && instead.set(text as string, (instead.get(text as string) ?? 0) + 1)))
    const [often] = [...instead.entries()].sort((first, second) => second[1] - first[1])
    return {
        word: index,
        text: word.text,
        line: word.line,
        wrong: count(mine, hearing => hearing.kind === 's'),
        dropped: count(mine, hearing => hearing.kind === 'm'),
        total: mine.length,
        instead: often ? { text: often[0], times: often[1] } : undefined,
        /** The few written words around it, to say where in the script it is. */
        phrase: tokens
            .slice(Math.max(0, word.token - 2), word.token + 2)
            .filter(token => token.line === word.line)
            .map(token => token.text)
            .join(' ')
            .replace(/[.,?!]+$/, ''),
    }
})
const mistakes = (tally: (typeof wordTally)[number]): number => tally.wrong + tally.dropped

/** Per speaker: the share of words the model in the middle of the pack got wrong, and how many models heard every word. */
const speakerTally = speakers.map((speaker, index) => {
    const rates = runs.map(bySpeaker => (count([...bySpeaker[index].kinds], kind => kind !== '.') + bySpeaker[index].added.length) / words.length)
    return { id: speaker.id, typical: median(rates), flawless: count(rates, rate => rate === 0) }
})

/** Every wait, per model: one per spoken line. */
const waits = runs.map(bySpeaker => bySpeaker.flatMap(run => run.said.map(line => line.wait)))
const streaming = models.map(model => model.mode === 'streaming')
const facts = {
    hearings: hearings.length,
    right: count(hearings, hearing => hearing.kind === '.'),
    wrong: count(hearings, hearing => hearing.kind === 's'),
    dropped: count(hearings, hearing => hearing.kind === 'm'),
    added: addedCount,
    scriptLines: lines.length,
    scriptWords: tokens.length,
    /** Script words every model heard right from every speaker. */
    wordsNeverMissed: count(wordTally, tally => mistakes(tally) === 0),
    /** The most often missed words, worst first. */
    worstWords: [...wordTally].sort((first, second) => mistakes(second) - mistakes(first)).slice(0, 12),
    speakers: speakerTally,
    spokenLines: waits[0].length,
    /** Per model, in ranking order: lines whose text arrived within a second, and lines with no text at all. */
    waits: waits.map((mine, model) => ({ id: models[model].id, withinTarget: count(mine, wait => wait !== null && wait < 1000), silent: count(mine, wait => wait === null), lines: mine.length })),
    /** Models that never took a second or more. */
    alwaysWithinTarget: count(waits, mine => mine.every(wait => wait !== null && wait < 1000)),
    streamingModels: count(streaming, Boolean),
    /** Per speaker: the first script word of each spoken line, for dividing a transcript into the lines as spoken. */
    spokenStarts: Object.fromEntries(speakers.map((speaker, index) => [speaker.id, starts[index]])),
}

writeFileSync(join(OUTPUT, 'heard.json'), JSON.stringify(heard))
writeFileSync(join(OUTPUT, 'waves.json'), JSON.stringify(waves))
writeFileSync(join(ROOT, 'src', 'facts.json'), `${JSON.stringify(facts)}\n`)
console.log(`voicebench: wrote ${models.length} models × ${speakers.length} speakers × ${words.length} words for the site`)
