/**
 * The published results, bundled at build time: results/voicebench.json for the overview and
 * results/models/<id>.json for each model's page. Every page is prerendered from these, so the site
 * needs no server and search engines see the numbers.
 */
import results from '@results/voicebench.json'

export const BENCH = {
    name: 'Voicebench',
    tagline: 'Which speech model hears real people best, and fastest?',
    repository: 'darkgrade/voicebench',
    /** Where the site is served; also Vite's base. */
    path: '/voicebench/',
    origin: 'https://darkgrade.com',
    /** What it is, in search terms: names like Toolbench are shared with academic benchmarks. */
    subject: 'Local speech-to-text benchmark on real voices',
}

/** The overview's tabs; each after the first is its own page at BENCH.path + id. */
export const TABS = [
    { id: 'results', label: 'Results' },
    { id: 'tradeoff', label: 'Accuracy vs. speed' },
    { id: 'method', label: 'How we test' },
    { id: 'take-part', label: 'Take part' },
]

export interface ErrorCounts {
    substitutions: number
    deletions: number
    insertions: number
    referenceWords: number
}

export interface Reason {
    area: string
    weight: number
    score: number
    points: number
    why: string
}

export interface ModelSummary {
    id: string
    /** 0–100, best 100 (see bench/voice-score.ts). */
    score?: number | null
    reasons?: Reason[]
    strengths?: string[]
    weaknesses?: string[]
    name: string
    maker: string
    licence?: string
    engine?: string
    mode?: string
    source?: string
    files?: { name: string; bytes: number; sha256: string }[]
    sizeGigabytes?: number
    error?: string
    wordErrorRate?: number
    characterErrorRate?: number
    errors?: ErrorCounts
    bySpeaker?: Record<string, number>
    latencyMedianMs?: number | null
    latencyP90Ms?: number | null
    latencyMaxMs?: number | null
    withinTarget?: number
    utterancesWithoutText?: number
    loadSeconds?: number
    peakMemoryGigabytes?: number
}

export interface Speaker {
    id: string
    audioSeconds?: number
}

export interface RunDetails {
    date?: string
    hardware?: { machine?: string; chip?: string; memoryGigabytes?: number; macOS?: string }
    engines?: Record<string, unknown>
    input?: { speakers?: Speaker[]; utteranceDetector?: string; endOfUtteranceSeconds?: number }
    method?: Record<string, string>
    models: ModelSummary[]
}

export type AlignedWord =
    | { kind: 'same' | 'substituted'; expected: string; heard: string }
    | { kind: 'missed'; expected: string }
    | { kind: 'added'; heard: string }

export interface ModelDetail {
    id: string
    speakers: {
        speaker: string
        wordErrorRate: number
        errors: ErrorCounts
        alignment: AlignedWord[]
        utterances: { startSeconds: number; endSeconds: number; text: string; latencyMs: number | null }[]
    }[]
}

export const RUN = results as RunDetails

/** How much the results rest on: speakers who recorded, and the spoken lines across all of them. */
export const SAMPLE = {
    speakers: RUN.input?.speakers?.length ?? 0,
    lines: (RUN.input?.speakers ?? []).reduce((sum, speaker) => sum + ((speaker as { utterances?: number }).utterances ?? 0), 0),
}

/** "English only, from 8 speakers (160 spoken lines)." */
export function sampleSentence(): string {
    const people = SAMPLE.speakers === 1 ? 'one speaker' : `${SAMPLE.speakers} speakers`
    return `English only for now, from ${people} (${SAMPLE.lines} spoken lines in all). With a sample this size, treat scores within a few points of each other as ties.`
}
export const MODELS = RUN.models.filter(model => !model.error && model.wordErrorRate !== undefined)

const details = import.meta.glob<ModelDetail>('../results/models/*.json', { eager: true, import: 'default' })
export function modelDetail(id: string): ModelDetail | undefined {
    return details[`../results/models/${id}.json`]
}

/** The categories the overview filters by, each a one-of-a-few choice. */
export const FILTERS: { id: string; label: string; options: { id: string; label: string; matches: (model: ModelSummary) => boolean }[] }[] = [
    {
        id: 'size',
        label: 'Size',
        options: [
            { id: 'all', label: 'Any size', matches: () => true },
            { id: 'small', label: 'Small', matches: model => (model.sizeGigabytes ?? Infinity) < 1 },
            { id: 'medium', label: 'Medium', matches: model => (model.sizeGigabytes ?? 0) >= 1 && (model.sizeGigabytes ?? 0) < 3 },
            { id: 'large', label: 'Large', matches: model => (model.sizeGigabytes ?? 0) >= 3 },
        ],
    },
    {
        id: 'mode',
        label: 'How it listens',
        options: [
            { id: 'all', label: 'Either', matches: () => true },
            { id: 'streaming', label: 'Streaming', matches: model => model.mode === 'streaming' },
            { id: 'line', label: 'Line by line', matches: model => model.mode !== 'streaming' },
        ],
    },
    {
        id: 'licence',
        label: 'Licence',
        options: [
            { id: 'all', label: 'Any licence', matches: () => true },
            { id: 'commercial', label: 'Commercial use', matches: model => !model.licence?.includes('NC') },
        ],
    },
]

export const percent = (value: number | null | undefined, places = 1): string => (value === null || value === undefined ? '–' : `${(value * 100).toFixed(places)}%`)
export const seconds = (milliseconds: number | null | undefined): string => (milliseconds === null || milliseconds === undefined ? '–' : `${(milliseconds / 1000).toFixed(2)} s`)

/** Every page the site has, with what its title, description and preview card say. */
export interface Route {
    path: string
    title: string
    description: string
    card: { heading: string; sub: string }
}

export function routes(): Route[] {
    const best = MODELS[0]
    const overview: Route = {
        path: '',
        title: `${BENCH.name} by Darkgrade: ${BENCH.subject}`,
        description: BENCH.tagline,
        card: { heading: BENCH.name, sub: BENCH.tagline },
    }
    const models = MODELS.map(
        (model): Route => ({
            path: `${model.id}/`,
            title: `${model.name} speech recognition benchmark | ${BENCH.name} by Darkgrade`,
            description: `${model.name} by ${model.maker} scores ${model.score ?? '–'}/100 at transcribing real people: ${percent(model.wordErrorRate)} word errors, ${seconds(model.latencyMedianMs)} typical wait.`,
            card: { heading: model.name, sub: `${model.score ?? '–'}/100 · ${percent(model.wordErrorRate)} word errors · ${seconds(model.latencyMedianMs)} wait` },
        })
    )
    const tabs = TABS.slice(1).map(
        (tab): Route => ({ ...overview, path: `${tab.id}/`, title: `${tab.label} | ${BENCH.name} by Darkgrade` })
    )
    return [overview, ...tabs, ...models]
}
