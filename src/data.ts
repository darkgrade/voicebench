/**
 * The published results' summary, bundled at build time: results/voicebench.json. Every page is
 * prerendered from it, so the site needs no server and search engines see the numbers. Each model's
 * transcripts are in src/details.ts (its own page) and src/heard.ts (the overview's views).
 */
import results from '@results/voicebench.json'
import type { Aligned } from '@site/spoken'

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

/** The overview's views; each after the first is its own page at BENCH.path + id. */
export const TABS = [
    { id: 'story', label: 'Story' },
    { id: 'listen', label: 'Listen' },
    { id: 'words', label: 'Words' },
    { id: 'tradeoff', label: 'Field' },
    { id: 'compare', label: 'Compare' },
    { id: 'results', label: 'Table' },
    { id: 'method', label: 'Method' },
    { id: 'take-part', label: 'Take part' },
]

/** What each view is, for its page title and description. */
const TAB_PAGES: Record<string, { title: string; description: string }> = {
    listen: { title: 'Listen along', description: "Play a real person reading the script and watch every speech model's text arrive, line by line, with each mistake marked." },
    words: { title: 'The words models mishear', description: 'The script word by word: which words speech models get wrong, what they write instead, and for which speakers.' },
    tradeoff: { title: 'Accuracy vs. speed', description: 'Every speech model by how many words it gets wrong and how long you wait for the text.' },
    compare: { title: 'Compare two models', description: 'Two speech models side by side: their scores, each speaker, every wait, and the words only one of them missed.' },
    results: { title: 'Results', description: 'Every speech model ranked by score, with word errors, waits, download size and licence.' },
    method: { title: 'How we test', description: 'The script, the recordings, the settings and the hardware behind every score, and how to repeat the run.' },
    'take-part': { title: 'Take part', description: 'Read the script into your phone and add your voice to the benchmark.' },
}

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

export type AlignedWord = Aligned

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

/** The model a path names, if it is a model's own page. */
export function modelFromPath(path: string): ModelSummary | undefined {
    const id = path.replace(BENCH.path, '').replace(/\/$/, '')
    return id ? MODELS.find(candidate => candidate.id === id) : undefined
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
        (tab): Route => ({ ...overview, path: `${tab.id}/`, title: `${TAB_PAGES[tab.id].title} | ${BENCH.name} by Darkgrade`, description: TAB_PAGES[tab.id].description, card: { heading: TAB_PAGES[tab.id].title, sub: TAB_PAGES[tab.id].description } })
    )
    return [overview, ...tabs, ...models]
}
