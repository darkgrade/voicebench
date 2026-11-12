/** The shape of results/raw/progress.json and the maths both the writer and the /progress page use. Browser-safe. */

export interface ProgressModel {
    id: string
    name: string
    sizeGigabytes: number
    /** skipped: already done in an earlier run of the same script, kept as it was (a resumed run). */
    status: 'waiting' | 'running' | 'done' | 'skipped' | 'failed' | 'stopped'
    startedAt?: number
    finishedAt?: number
    /** Headline numbers once done, e.g. { score: 68, 'Turns right': '83%' }. */
    result?: Record<string, string | number>
    error?: string
}

export interface ProgressStep {
    model: string
    label: string
    passed?: boolean
    note?: string
    at: number
}

export interface ProgressFile {
    benchmark: string
    /** running → stopping (stop asked for, finishing the current step) → stopped; or finished. */
    state: 'running' | 'stopping' | 'stopped' | 'finished'
    /** The run's process, so the page can tell a live run from one that died. */
    pid?: number
    startedAt: number
    updatedAt: number
    finishedAt?: number
    models: ProgressModel[]
    current?: { model: string; step: number; steps: number; label: string; startedAt: number }
    recent: ProgressStep[]
}

/**
 * Time left, in ms: the finished models' seconds per GB of model, times the GB still to run (bigger
 * models take longer), minus what the current model has already used. Null until one model is done.
 */
export function timeLeftMs(progress: ProgressFile, now = Date.now()): number | null {
    const done = progress.models.filter(model => model.status === 'done' && model.startedAt && model.finishedAt)
    const doneGigabytes = done.reduce((sum, model) => sum + model.sizeGigabytes, 0)
    if (!done.length || doneGigabytes === 0) return null
    const perGigabyte = done.reduce((sum, model) => sum + (model.finishedAt! - model.startedAt!), 0) / doneGigabytes
    const left = progress.models.filter(model => model.status === 'waiting' || model.status === 'running')
    const running = left.find(model => model.status === 'running')
    const total = left.reduce((sum, model) => sum + model.sizeGigabytes * perGigabyte, 0)
    return Math.max(0, total - (running?.startedAt ? now - running.startedAt : 0))
}

/** One line for a chat update: "7/24 done: … Next: …, about 1 h 10 min left." */
export function summaryLine(progress: ProgressFile): string {
    const finished = progress.models.filter(model => model.status === 'done' || model.status === 'skipped' || model.status === 'failed')
    const last = [...finished].sort((first, second) => (second.finishedAt ?? 0) - (first.finishedAt ?? 0))[0]
    const next = progress.models.find(model => model.status === 'running') ?? progress.models.find(model => model.status === 'waiting')
    const left = timeLeftMs(progress)
    const minutes = left === null ? null : Math.round(left / 60_000)
    const leftText = minutes === null ? '' : minutes >= 60 ? `, about ${Math.floor(minutes / 60)} h ${minutes % 60} min left` : `, about ${minutes} min left`
    const lastText = last ? (last.status === 'failed' ? `${last.name} failed (${last.error})` : `${last.name}: ${Object.entries(last.result ?? {}).map(([key, value]) => `${key} ${value}`).join(', ')}`) : 'starting'
    return `${finished.length}/${progress.models.length} done: ${lastText}.${next ? ` Next: ${next.name}${leftText}.` : ' All done.'}`
}

