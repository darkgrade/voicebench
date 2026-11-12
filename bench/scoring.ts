/**
 * Scores a transcript against the script. Both sides are normalised the same way first, so a model
 * isn't marked wrong for a different but valid way of writing the same words: case, punctuation,
 * British or American spelling, contractions ("what's" = "what is") and numbers ("ten" = "10").
 */

export interface ErrorCounts {
    substitutions: number
    deletions: number
    insertions: number
    referenceWords: number
}

const SPELLINGS: [RegExp, string][] = [
    [/\bcolour/g, 'color'],
    [/\bgrey\b/g, 'gray'],
    [/\bfavourite/g, 'favorite'],
    [/\bcentre\b/g, 'center'],
]

/** Whole-word contractions; the regular endings (n't, 're, 'll, 've, 'm, 'd) are expanded after these. */
const CONTRACTIONS: Record<string, string> = {
    "won't": 'will not',
    "can't": 'can not',
    cannot: 'can not',
    "let's": 'let us',
    "what's": 'what is',
    "that's": 'that is',
    "there's": 'there is',
    "it's": 'it is',
    "he's": 'he is',
    "she's": 'she is',
    "here's": 'here is',
    "who's": 'who is',
    "where's": 'where is',
    "how's": 'how is',
}

const UNITS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

function expandContractions(text: string): string {
    let expanded = text
    for (const [short, long] of Object.entries(CONTRACTIONS)) {
        expanded = expanded.replace(new RegExp(`\\b${short}\\b`, 'g'), long)
    }
    return expanded
        .replace(/n't\b/g, ' not')
        .replace(/'re\b/g, ' are')
        .replace(/'ll\b/g, ' will')
        .replace(/'ve\b/g, ' have')
        .replace(/'m\b/g, ' am')
        .replace(/'d\b/g, ' would')
}

/** Spelled-out numbers below a thousand become digits ("twenty one" → "21", "one hundred" → "100"). */
function numbersToDigits(words: string[]): string[] {
    const output: string[] = []
    let index = 0
    while (index < words.length) {
        let value: number | null = null
        let cursor = index
        const unit = (word: string | undefined): number | undefined => (word === undefined ? undefined : UNITS[word])
        if (unit(words[cursor]) !== undefined && words[cursor + 1] === 'hundred') {
            value = unit(words[cursor])! * 100
            cursor += 2
            if (words[cursor] === 'and' && (TENS[words[cursor + 1]] !== undefined || unit(words[cursor + 1]) !== undefined)) cursor++
        }
        if (TENS[words[cursor]] !== undefined) {
            value = (value ?? 0) + TENS[words[cursor]]
            cursor++
            const ones = unit(words[cursor])
            if (ones !== undefined && ones > 0 && ones < 10) {
                value += ones
                cursor++
            }
        } else if (unit(words[cursor]) !== undefined) {
            value = (value ?? 0) + unit(words[cursor])!
            cursor++
        }
        if (value === null) {
            output.push(words[index])
            index++
            continue
        }
        output.push(String(value))
        index = cursor
    }
    return output
}

/** Lower case, spelling unified, contractions expanded, punctuation dropped, numbers as digits. */
export function normalise(text: string): string[] {
    let lower = text.toLowerCase().replace(/[‘’`]/g, "'")
    for (const [british, american] of SPELLINGS) lower = lower.replace(british, american)
    const words = expandContractions(lower)
        .replace(/(\d),(\d{3})\b/g, '$1$2')
        .replace(/[–—-]/g, ' ')
        .replace(/[^a-z0-9' ]+/g, ' ')
        .replace(/(^|\s)'+|'+(\s|$)/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    return numbersToDigits(words)
}

/** Levenshtein alignment between two token lists, counted by kind of error. */
export function errorCounts(reference: string[], hypothesis: string[]): ErrorCounts {
    const columns = hypothesis.length + 1
    const cost = new Uint32Array((reference.length + 1) * columns)
    for (let row = 0; row <= reference.length; row++) cost[row * columns] = row
    for (let column = 0; column < columns; column++) cost[column] = column
    for (let row = 1; row <= reference.length; row++) {
        for (let column = 1; column < columns; column++) {
            const same = reference[row - 1] === hypothesis[column - 1] ? 0 : 1
            cost[row * columns + column] = Math.min(cost[(row - 1) * columns + column - 1] + same, cost[(row - 1) * columns + column] + 1, cost[row * columns + column - 1] + 1)
        }
    }
    const counts = { substitutions: 0, deletions: 0, insertions: 0 }
    let row = reference.length
    let column = hypothesis.length
    while (row > 0 || column > 0) {
        const here = cost[row * columns + column]
        const diagonal = row > 0 && column > 0 ? cost[(row - 1) * columns + column - 1] + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1) : Infinity
        if (here === diagonal) {
            if (reference[row - 1] !== hypothesis[column - 1]) counts.substitutions++
            row--
            column--
        } else if (row > 0 && here === cost[(row - 1) * columns + column] + 1) {
            counts.deletions++
            row--
        } else {
            counts.insertions++
            column--
        }
    }
    return { ...counts, referenceWords: reference.length }
}

export function errorRate(counts: ErrorCounts): number {
    return counts.referenceWords ? (counts.substitutions + counts.deletions + counts.insertions) / counts.referenceWords : 0
}

/** Word errors and character errors of one transcript against the script. */
export function scoreTranscript(reference: string, hypothesis: string): { words: ErrorCounts; characters: ErrorCounts } {
    const referenceWords = normalise(reference)
    const hypothesisWords = normalise(hypothesis)
    return {
        words: errorCounts(referenceWords, hypothesisWords),
        characters: errorCounts([...referenceWords.join(' ')], [...hypothesisWords.join(' ')]),
    }
}

/** Adds error counts, so rates are pooled over every word rather than averaged per speaker. */
export function sumCounts(all: ErrorCounts[]): ErrorCounts {
    return all.reduce(
        (total, counts) => ({
            substitutions: total.substitutions + counts.substitutions,
            deletions: total.deletions + counts.deletions,
            insertions: total.insertions + counts.insertions,
            referenceWords: total.referenceWords + counts.referenceWords,
        }),
        { substitutions: 0, deletions: 0, insertions: 0, referenceWords: 0 }
    )
}

/** One step of the alignment between script and transcript, for showing a model's mistakes word by word. */
export type AlignedWord = { kind: 'same' | 'substituted'; expected: string; heard: string } | { kind: 'missed'; expected: string } | { kind: 'added'; heard: string }

/** The word-by-word alignment behind errorCounts, in reading order, on normalised words. */
export function align(reference: string, hypothesis: string): AlignedWord[] {
    const expected = normalise(reference)
    const heard = normalise(hypothesis)
    const columns = heard.length + 1
    const cost = new Uint32Array((expected.length + 1) * columns)
    for (let row = 0; row <= expected.length; row++) cost[row * columns] = row
    for (let column = 0; column < columns; column++) cost[column] = column
    for (let row = 1; row <= expected.length; row++) {
        for (let column = 1; column < columns; column++) {
            const same = expected[row - 1] === heard[column - 1] ? 0 : 1
            cost[row * columns + column] = Math.min(cost[(row - 1) * columns + column - 1] + same, cost[(row - 1) * columns + column] + 1, cost[row * columns + column - 1] + 1)
        }
    }
    const steps: AlignedWord[] = []
    let row = expected.length
    let column = heard.length
    while (row > 0 || column > 0) {
        const here = cost[row * columns + column]
        const diagonal = row > 0 && column > 0 ? cost[(row - 1) * columns + column - 1] + (expected[row - 1] === heard[column - 1] ? 0 : 1) : Infinity
        if (here === diagonal) {
            steps.push({ kind: expected[row - 1] === heard[column - 1] ? 'same' : 'substituted', expected: expected[row - 1], heard: heard[column - 1] })
            row--
            column--
        } else if (row > 0 && here === cost[(row - 1) * columns + column] + 1) {
            steps.push({ kind: 'missed', expected: expected[row - 1] })
            row--
        } else {
            steps.push({ kind: 'added', heard: heard[column - 1] })
            column--
        }
    }
    return steps.reverse()
}
