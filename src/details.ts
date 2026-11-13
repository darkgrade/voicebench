/**
 * Each model's transcripts (results/models/<id>.json), one file per model, loaded on demand: a
 * model's own page loads its own before it renders, so it never carries the others'.
 */
import type { ModelDetail } from '@site/data'

const details = import.meta.glob<ModelDetail>('/results/models/*.json', { import: 'default' })

export function loadDetail(id: string): Promise<ModelDetail | undefined> {
    return details[`/results/models/${id}.json`]?.() ?? Promise.resolve(undefined)
}
