/**
 * How a recording's word-by-word result divides into the lines its speaker spoke, and what a model
 * wrote for each. Plain functions over the published results, shared by the build
 * (scripts/build-data.ts) and each model's own page, so both mark the same words the same way.
 */
import { normalise } from '@bench/scoring'

/** A word as the script writes it, and the words it is scored as ("What's" is scored as "what" and "is"). */
export interface Token {
    text: string
    line: number
    first: number
    count: number
}

/** One word models are scored on. */
export interface Word {
    text: string
    line: number
    token: number
}

export interface Script {
    /** The numbered lines, as written. */
    lines: string[]
    tokens: Token[]
    words: Word[]
}

/** One step of a model's alignment against the script, as the results file records it. */
export type Aligned = { kind: 'same' | 'substituted'; expected: string; heard: string } | { kind: 'missed'; expected: string } | { kind: 'added'; heard: string }

/** One step of a model's alignment, with the script word it is about and the spoken line it belongs to. */
export interface Step {
    kind: Aligned['kind']
    /** The script word; for an added word, the script word it came before. */
    word: number
    heard?: string
    utterance: number
}

/** What a model wrote for one spoken line. */
export interface Said {
    text: string
    /** Milliseconds from the end of the line to its text; null when no text came. */
    wait: number | null
    /** Written words that are wrong ('s', with the script words they replaced) or added ('a'), by their place in the text. */
    marks?: [number, 's' | 'a', number[]][]
    /** Script words that were dropped, and the written word each came before. */
    ghosts?: [number, number][]
}

export type Outcome = 'right' | 'wrong' | 'dropped' | 'added'

/** The reading script's numbered lines, each written word, and the words models are scored on. */
export function readScript(markdown: string): Script {
    const lines = markdown
        .split('\n')
        .map(line => line.match(/^\d+\.\s+(.*)$/)?.[1])
        .filter((line): line is string => Boolean(line))
    const tokens: Token[] = []
    const words: Word[] = []
    lines.forEach((line, lineIndex) => {
        for (const written of line.split(/\s+/)) {
            const scored = normalise(written)
            const bare = written.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
            tokens.push({ text: written, line: lineIndex, first: words.length, count: scored.length })
            // A written word scored as one word keeps its spelling ("four", not "4"); "What's" is scored as "what" and "is".
            for (const word of scored) words.push({ text: scored.length === 1 ? bare : word, line: lineIndex, token: tokens.length - 1 })
        }
    })
    return { lines, tokens, words }
}

/** Which spoken line each word a model wrote belongs to: the lines' own word counts, in order. */
export function writtenOwners(utterances: { text: string }[]): number[] {
    return utterances.flatMap((utterance, index) => normalise(utterance.text).map(() => index))
}

/**
 * A model's alignment for one recording, each step given its spoken line. `starts` is the first
 * script word of each of the speaker's spoken lines (most models agree on these; the build works
 * them out), which decides where a dropped word belongs.
 */
export function placeSteps(alignment: Aligned[], utterances: { text: string }[], starts: number[]): Step[] {
    const owner = writtenOwners(utterances)
    const steps: Step[] = []
    let word = 0
    let heard = 0
    for (const step of alignment) {
        steps.push({ kind: step.kind, word, heard: step.kind === 'missed' ? undefined : step.heard, utterance: step.kind === 'missed' ? -1 : (owner[heard] ?? utterances.length - 1) })
        if (step.kind !== 'missed') heard++
        if (step.kind !== 'added') word++
    }
    // A dropped word belongs to the line it was spoken in, kept between the lines of the words written around it.
    let before = 0
    steps.forEach((step, index) => {
        if (step.utterance >= 0) {
            before = step.utterance
            return
        }
        const after = steps.slice(index + 1).find(later => later.utterance >= 0)?.utterance ?? utterances.length - 1
        const spoken = Math.max(0, starts.findLastIndex(start => start <= step.word))
        step.utterance = Math.min(after, Math.max(before, spoken))
    })
    return steps
}

/** What a model wrote for one spoken line, with the words it got wrong marked by their place in the text. */
export function writtenLine(text: string, wait: number | null, steps: Step[]): Said {
    const heard = steps.filter(step => step.kind !== 'missed')
    const pieces = text.trim().split(/\s+/).filter(Boolean)
    const sizes = pieces.map(piece => normalise(piece).length)
    // Words that only score together ("twenty one") can't be marked one by one: show them as scored.
    const exact = sizes.reduce((sum, size) => sum + size, 0) === heard.length
    const shown = exact ? pieces : heard.map(step => step.heard!)
    const spans = exact ? sizes : heard.map(() => 1)
    const pieceOf: number[] = spans.flatMap((size, piece) => new Array<number>(size).fill(piece))
    const marks: NonNullable<Said['marks']> = []
    const ghosts: NonNullable<Said['ghosts']> = []
    let position = 0
    for (const step of steps) {
        if (step.kind === 'missed') {
            ghosts.push([pieceOf[position] ?? shown.length, step.word])
            continue
        }
        const piece = pieceOf[position++]
        if (step.kind === 'same') continue
        const mark = marks.find(existing => existing[0] === piece)
        if (!mark) marks.push([piece, step.kind === 'substituted' ? 's' : 'a', step.kind === 'substituted' ? [step.word] : []])
        else if (step.kind === 'substituted') {
            mark[1] = 's'
            mark[2].push(step.word)
        }
    }
    return {
        text: shown.join(' '),
        wait: wait === null ? null : Math.round(wait),
        ...(marks.length ? { marks } : {}),
        ...(ghosts.length ? { ghosts } : {}),
    }
}

/** One written word of a transcript, or a dropped script word shown in its place. */
export interface Piece {
    text: string
    outcome: Outcome
    /** For a wrong word: what the script says. */
    expected?: string
}

/** A spoken line's transcript as words to draw: what was written, mistakes marked, dropped words put back as ghosts. */
export function pieces(words: Word[], said: Said): Piece[] {
    const written = said.text ? said.text.split(' ') : []
    const ghostsBefore = (position: number): Piece[] => (said.ghosts ?? []).filter(([before]) => before === position).map(([, word]) => ({ text: words[word].text, outcome: 'dropped' }))
    const output: Piece[] = []
    written.forEach((text, position) => {
        output.push(...ghostsBefore(position))
        const mark = said.marks?.find(([at]) => at === position)
        output.push(mark ? { text, outcome: mark[1] === 's' ? 'wrong' : 'added', expected: mark[2].map(word => words[word].text).join(' ') || undefined } : { text, outcome: 'right' })
    })
    // Ghosts after the last written word, or all of them when nothing was written.
    output.push(...(said.ghosts ?? []).filter(([before]) => before >= written.length).map(([, word]): Piece => ({ text: words[word].text, outcome: 'dropped' })))
    return output
}
