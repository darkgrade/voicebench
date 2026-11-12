/**
 * The shared 0–100 score, the same shape in every bench (Camera Atlas's spec level, voicebench, textbench,
 * cambench): a few areas, each scored on a fixed scale (not against the other entries, so a score doesn't
 * move when the field changes), weighted by how much the area matters. Every area says why it scored what
 * it did; an area with nothing known is left out and the rest are reweighted, and with under half the
 * weight known there's no score rather than a wrong one. 100 is best, 0 worst.
 */

export interface Reason {
    area: string
    weight: number
    /** This area's score, 0–100. */
    score: number
    /** Its contribution to the total. */
    points: number
    why: string
}

export interface Score {
    score: number | null
    /** Share of the total weight that could be scored, 0–100. */
    coverage: number
    reasons: Reason[]
    missing: string[]
    strengths: string[]
    weaknesses: string[]
}

export interface Area<Input> {
    area: string
    weight: number
    /** A 0..1 score and the reason for it, or null when nothing is known. */
    score: (input: Input) => { value: number; why: string } | null
}

export const clamp = (value: number): number => Math.max(0, Math.min(1, value))

/** Where value sits from worst (0) to best (1) on a log scale, so each doubling counts the same. Works either way round. */
export const logScale = (value: number, worst: number, best: number): number => clamp(Math.log(value / worst) / Math.log(best / worst))

/** Where value sits from worst (0) to best (1), linearly. Works either way round. */
export const linear = (value: number, worst: number, best: number): number => clamp((value - worst) / (best - worst))

/** How far an area must pull from its middle, times its weight, to count as a strength or weakness. */
const NOTABLE_PULL = 1200

export function scoreWith<Input>(areas: Area<Input>[], input: Input): Score {
    const reasons: Reason[] = []
    const missing: string[] = []
    for (const area of areas) {
        const result = area.score(input)
        if (!result) {
            missing.push(area.area)
            continue
        }
        const value = clamp(result.value)
        reasons.push({ area: area.area, weight: area.weight, score: Math.round(value * 100), points: Math.round(value * area.weight * 10) / 10, why: result.why })
    }
    const known = reasons.reduce((sum, reason) => sum + reason.weight, 0)
    const total = areas.reduce((sum, area) => sum + area.weight, 0)
    const score = known >= total / 2 ? Math.round((reasons.reduce((sum, reason) => sum + (reason.score / 100) * reason.weight, 0) / known) * 100) : null
    const pull = (reason: Reason): number => (reason.score - 50) * reason.weight
    const ranked = [...reasons].sort((first, second) => pull(second) - pull(first))
    return {
        score,
        coverage: Math.round((known / total) * 100),
        reasons,
        missing,
        strengths: ranked.filter(reason => pull(reason) >= NOTABLE_PULL).slice(0, 3).map(reason => reason.why),
        weaknesses: ranked.filter(reason => pull(reason) <= -NOTABLE_PULL).reverse().slice(0, 3).map(reason => reason.why),
    }
}
