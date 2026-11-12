/**
 * Live progress for a benchmark run, in results/raw/progress.json: overall (which model, time left),
 * the current model's step, finished models' headline numbers and the latest steps. The same file in
 * every bench; the dev site's /progress page and Claude both read it. Written whole on every change
 * (to a temporary file, then renamed) so a reader never sees half of it.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { type ProgressFile, summaryLine } from '@bench/progress-shape'

export { summaryLine, timeLeftMs } from '@bench/progress-shape'

export const PROGRESS_PATH = resolve(import.meta.dirname, '..', 'results', 'raw', 'progress.json')
/** Present while a stop has been asked for (by the page's Stop button or `bun run bench:stop`). */
export const STOP_PATH = resolve(import.meta.dirname, '..', 'results', 'raw', 'stop-requested')
const RECENT_STEPS = 12

function read(): ProgressFile | null {
    return existsSync(PROGRESS_PATH) ? (JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as ProgressFile) : null
}

function write(progress: ProgressFile): void {
    progress.updatedAt = Date.now()
    mkdirSync(dirname(PROGRESS_PATH), { recursive: true })
    const temporary = join(dirname(PROGRESS_PATH), '.progress.json.tmp')
    writeFileSync(temporary, JSON.stringify(progress))
    renameSync(temporary, PROGRESS_PATH)
}

function update(change: (progress: ProgressFile) => void): void {
    const progress = read()
    if (!progress) return
    change(progress)
    write(progress)
}

/**
 * A new run of these models, in order. Replaces any earlier progress. Models in `alreadyDone` (a resumed
 * run) are shown as skipped with their earlier result and aren't run again.
 */
export function startRun(benchmark: string, models: { id: string; name: string; sizeGigabytes: number }[], alreadyDone: Map<string, Record<string, string | number>> = new Map()): void {
    rmSync(STOP_PATH, { force: true })
    write({
        benchmark,
        state: 'running',
        pid: process.pid,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        models: models.map(model => (alreadyDone.has(model.id) ? { ...model, status: 'skipped', result: alreadyDone.get(model.id) } : { ...model, status: 'waiting' })),
        recent: [],
    })
}

/** Asks the run to stop after its current step; the run stops its engine and marks itself stopped. */
export function requestStop(): void {
    mkdirSync(dirname(STOP_PATH), { recursive: true })
    writeFileSync(STOP_PATH, String(Date.now()))
    update(progress => {
        if (progress.state === 'running') progress.state = 'stopping'
    })
}

export function stopRequested(): boolean {
    return existsSync(STOP_PATH)
}

/** The current model was stopped part-way; it's left out of the results and runs again on resume. */
export function stopModel(id: string): void {
    update(progress => {
        const model = progress.models.find(candidate => candidate.id === id)
        if (model) Object.assign(model, { status: 'stopped', finishedAt: Date.now() })
        progress.current = undefined
    })
}

export function startModel(id: string, steps: number, label = 'Loading the model'): void {
    update(progress => {
        const model = progress.models.find(candidate => candidate.id === id)
        if (model) Object.assign(model, { status: 'running', startedAt: Date.now() })
        progress.current = { model: id, step: 0, steps, label, startedAt: Date.now() }
    })
}

/** One step of the current model done (a turn, an utterance …), with how it went. */
export function stepDone(id: string, step: number, steps: number, label: string, outcome: { passed?: boolean; note?: string } = {}): void {
    update(progress => {
        progress.current = { model: id, step, steps, label, startedAt: progress.current?.startedAt ?? Date.now() }
        progress.recent = [{ model: id, label, ...outcome, at: Date.now() }, ...progress.recent].slice(0, RECENT_STEPS)
    })
}

export function finishModel(id: string, result: Record<string, string | number>): void {
    update(progress => {
        const model = progress.models.find(candidate => candidate.id === id)
        if (model) Object.assign(model, { status: 'done', finishedAt: Date.now(), result })
        progress.current = undefined
    })
}

export function failModel(id: string, error: string): void {
    update(progress => {
        const model = progress.models.find(candidate => candidate.id === id)
        if (model) Object.assign(model, { status: 'failed', finishedAt: Date.now(), error })
        progress.current = undefined
    })
}

export function finishRun(state: 'finished' | 'stopped' = 'finished'): void {
    update(progress => {
        progress.state = state
        progress.finishedAt = Date.now()
        progress.current = undefined
    })
    rmSync(STOP_PATH, { force: true })
}

/** `bun bench/progress.ts` prints the summary line (what Claude posts to chat); `--stop` asks the run to stop. */
if (import.meta.main) {
    if (process.argv.includes('--stop')) {
        requestStop()
        console.log('Asked the run to stop after its current step.')
    } else {
        const progress = read()
        console.log(progress ? summaryLine(progress) : 'No run in progress.')
    }
}
