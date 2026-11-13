/**
 * Everything every model heard, as the overview's views read it: the script word by word, and for
 * each model and speaker how each word came out, what was written for each spoken line and how long
 * it took (scripts/build-data.ts writes public/data/heard.json from the published results).
 * Loaded once, on first use, in the browser.
 */
import { BENCH, MODELS, type ModelSummary } from '@site/data'
import { TONE } from '@site/kit/theme'
import { type Outcome, type Said, type Token, type Word } from '@site/spoken'
import { useEffect, useState } from 'react'

export type { Outcome, Said, Token, Word }

/** One stretch of speech in a recording, and the script words it covers (`last` is one past the end). */
export interface Spoken {
    start: number
    end: number
    first: number
    last: number
}

export interface SpeakerTrack {
    id: string
    seconds: number
    utterances: Spoken[]
}

/** One model on one speaker's recording. */
export interface Run {
    /** Per script word: '.' heard right, 's' heard as another word, 'm' dropped. */
    kinds: string
    /** Per script word: the spoken line it fell in, as a letter (A is the first). */
    spoken: string
    /** Wrong words: the script word and what was written instead. */
    heard: [number, string][]
    /** Added words: the script word they came before, what was written, and the spoken line. */
    added: [number, string, number][]
    said: Said[]
}

export interface Heard {
    /** Model ids, best score first: the order of `runs`. */
    models: string[]
    lines: string[]
    tokens: Token[]
    words: Word[]
    speakers: SpeakerTrack[]
    /** By model, then by speaker. */
    runs: Run[][]
}

/** Each recording's loudness over time, 0–100, for drawing a waveform before any audio is loaded. */
export interface Waves {
    perSecond: number
    speakers: Record<string, number[]>
}

const loading = new Map<string, Promise<unknown>>()

function load<T>(file: string): Promise<T> {
    const found = loading.get(file)
    if (found) return found as Promise<T>
    const started = fetch(`${BENCH.path}data/${file}`).then(response => {
        if (!response.ok) throw new Error(`${file}: ${response.status}`)
        return response.json() as Promise<T>
    })
    loading.set(file, started)
    return started
}

/** A fetched file once it has loaded; undefined until then, an Error if it couldn't be. */
function useLoaded<T>(file: string): T | Error | undefined {
    const [loaded, setLoaded] = useState<T | Error>()
    useEffect(() => {
        let current = true
        load<T>(file).then(
            value => current && setLoaded(value),
            error => current && setLoaded(error instanceof Error ? error : new Error(String(error)))
        )
        return () => {
            current = false
        }
    }, [file])
    return loaded
}

export const useHeard = (): Heard | Error | undefined => useLoaded<Heard>('heard.json')
export const useWaves = (): Waves | Error | undefined => useLoaded<Waves>('waves.json')

/** Where a speaker's published recording is served. */
export const audioPath = (speaker: string): string => `${BENCH.path}data/audio/${speaker}.wav`

export const OUTCOMES: Record<Outcome, { label: string; color: string }> = {
    right: { label: 'Right', color: TONE.good },
    wrong: { label: 'Wrong word', color: TONE.bad },
    dropped: { label: 'Dropped', color: TONE.worst },
    added: { label: 'Added', color: TONE.fair },
}

/** The colours points of light are drawn in, and each outcome's place among them. */
export const OUTCOME_PALETTE = [OUTCOMES.right.color, OUTCOMES.wrong.color, OUTCOMES.dropped.color, OUTCOMES.added.color]
export const OUTCOME_COLOR_INDEX: Record<Outcome, number> = { right: 0, wrong: 1, dropped: 2, added: 3 }

/** What happened to one script word, in a few words: "Wrote “for” for “four”". */
export function hearingSentence(outcome: Outcome, word: string, written?: string): string {
    if (outcome === 'wrong') return `Wrote “${written}” for “${word}”`
    if (outcome === 'dropped') return `Dropped “${word}”`
    if (outcome === 'added') return `Added “${written}” before “${word}”`
    return `Heard “${word}” right`
}

const LETTER_OUTCOMES: Record<string, Outcome> = { '.': 'right', s: 'wrong', m: 'dropped' }

/** How a model heard one script word. */
export const outcomeAt = (run: Run, word: number): Outcome => LETTER_OUTCOMES[run.kinds[word]]

/** The spoken line a script word fell in, for one model's run. */
export const spokenAt = (run: Run, word: number): number => run.spoken.charCodeAt(word) - 65

/** The summary row for a model id; the file lists only models that have one. */
export const summary = (id: string): ModelSummary => MODELS.find(model => model.id === id)!

/** A model's name without its bracketed note, for tight places. */
export const shortName = (model: ModelSummary): string => model.name.replace(/\s*\(.*\)$/, '')

/** "Speaker 3" for speaker-03. */
export const speakerName = (id: string): string => `Speaker ${Number(id.replace('speaker-', ''))}`

/** The script lines a stretch of speech covers, as written, or nothing when it is not from the script. */
export function scriptFor(heard: Heard, spoken: Spoken): string {
    if (spoken.last <= spoken.first) return ''
    const from = heard.words[spoken.first].line
    const to = heard.words[spoken.last - 1].line
    return heard.lines.slice(from, to + 1).join(' ')
}

/** The query that opens Listen at a speaker, a model and one of the speaker's spoken lines (counted from 1). */
export const listenQuery = (speaker: string, model: string | undefined, utterance: number): string =>
    `?speaker=${speaker}${model ? `&model=${model}` : ''}&utterance=${utterance + 1}`
