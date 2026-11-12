/**
 * Voicebench's 0–100 score: how well a model hears people (accuracy) and how quickly the words show up
 * (speed). Fixed scales, so a model's score doesn't change when other models are added.
 */
import { type Area, type Score, logScale, scoreWith } from '@bench/rubric'

export interface VoiceMeasurements {
    wordErrorRate?: number
    latencyMedianMs?: number | null
    latencyP90Ms?: number | null
    withinTarget?: number
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`
const seconds = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(2)} s`

export const VOICE_AREAS: Area<VoiceMeasurements>[] = [
    {
        area: 'Accuracy',
        weight: 60,
        // 15% word errors scores 0, 2% scores 100: each halving of mistakes is worth the same.
        score: ({ wordErrorRate }) => (wordErrorRate === undefined ? null : { value: logScale(Math.max(wordErrorRate, 0.001), 0.15, 0.02), why: `${percent(wordErrorRate)} word errors` }),
    },
    {
        area: 'Typical wait',
        weight: 25,
        // From the end of speaking to the text: 1.5 s scores 0, 50 ms scores 100.
        score: ({ latencyMedianMs }) => (latencyMedianMs == null ? null : { value: logScale(Math.max(latencyMedianMs, 1), 1500, 50), why: `${seconds(latencyMedianMs)} typical wait` }),
    },
    {
        area: 'Slow wait',
        weight: 15,
        // The slowest 1 in 10: 3 s scores 0, 150 ms scores 100.
        score: ({ latencyP90Ms }) => (latencyP90Ms == null ? null : { value: logScale(Math.max(latencyP90Ms, 1), 3000, 150), why: `${seconds(latencyP90Ms)} for the slowest 1 in 10` }),
    },
]

export function voiceScore(measurements: VoiceMeasurements): Score {
    return scoreWith(VOICE_AREAS, measurements)
}
