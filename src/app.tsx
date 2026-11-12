import { Byline } from '@kevinschaich/components'
import { BENCH, MODELS } from '@site/data'
import { ModelPage } from '@site/pages/model'
import { Overview } from '@site/pages/overview'
import { ProgressPage } from '@site/pages/progress'

/** The page for a path under BENCH.path: the overview, or one model's page. */
export function App({ path }: { path: string }) {
    const id = path.replace(BENCH.path, '').replace(/\/$/, '')
    const model = id ? MODELS.find(candidate => candidate.id === id) : undefined
    return (
        <div className="mx-auto flex min-h-svh max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <a href={BENCH.path} className="font-heading text-2xl font-semibold tracking-tight hover:underline">
                        {BENCH.name}
                    </a>
                    <p className="text-sm text-muted-foreground">{BENCH.tagline}</p>
                </div>
                <Byline repo={BENCH.repository} />
            </header>
            {id === 'progress' ? <ProgressPage /> : model ? <ModelPage model={model} /> : <Overview />}
        </div>
    )
}
