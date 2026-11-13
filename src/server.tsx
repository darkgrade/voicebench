/** Renders each page to HTML at build time (scripts/prerender.ts), so every page is static and crawlable. */
import { Overview } from '@site/app'
import { MODELS, type ModelDetail, modelFromPath } from '@site/data'
import { loadDetail } from '@site/details'
import { Entry } from '@site/entry'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'

export { routes, BENCH } from '@site/data'

const details = new Map<string, ModelDetail | undefined>(await Promise.all(MODELS.map(async (model): Promise<[string, ModelDetail | undefined]> => [model.id, await loadDetail(model.id)])))

export function render(path: string): string {
    const model = modelFromPath(path)
    return renderToString(<StrictMode>{model ? <Entry model={model} detail={details.get(model.id)} /> : <Overview path={path} />}</StrictMode>)
}
