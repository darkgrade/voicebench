import { errorCounts, errorRate, normalise, scoreTranscript } from '@bench/scoring'
import { describe, expect, it } from 'bun:test'

describe('normalise', () => {
    it('treats spelled-out numbers and digits the same', () => {
        expect(normalise('Set a timer for ten minutes.')).toEqual(normalise('Set a timer for 10 minutes'))
        expect(normalise('about fifteen minutes late')).toEqual(['about', '15', 'minutes', 'late'])
        expect(normalise('twenty one')).toEqual(['21'])
        expect(normalise('one hundred and five')).toEqual(['105'])
    })

    it('expands contractions and drops case and punctuation', () => {
        expect(normalise("What's the weather like? I'll join you, don't wait.")).toEqual(['what', 'is', 'the', 'weather', 'like', 'i', 'will', 'join', 'you', 'do', 'not', 'wait'])
        expect(normalise("Thanks, that's all.")).toEqual(normalise('thanks that is all'))
    })
})

describe('errorCounts', () => {
    it('counts each kind of error', () => {
        expect(errorCounts(['stop'], ['stop', 'now'])).toEqual({ substitutions: 0, deletions: 0, insertions: 1, referenceWords: 1 })
        expect(errorCounts(['cancel', 'that'], ['cancel'])).toEqual({ substitutions: 0, deletions: 1, insertions: 0, referenceWords: 2 })
        expect(errorCounts(['buy', 'eggs'], ['by', 'eggs'])).toEqual({ substitutions: 1, deletions: 0, insertions: 0, referenceWords: 2 })
        expect(errorRate(errorCounts(['play', 'some', 'quiet', 'jazz'], ['play', 'quite', 'jazz', 'now']))).toBe(0.75)
    })

    it('scores a correct transcript written differently as perfect', () => {
        const { words } = scoreTranscript("Wake me up at six tomorrow. Yes, send it.", 'wake me up at 6 tomorrow yes send it')
        expect(errorRate(words)).toBe(0)
    })
})
