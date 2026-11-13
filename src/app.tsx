import { BENCH, TABS } from '@site/data'
import { Loading, Page, Shell, tabFromPath, useTab } from '@site/kit/shell'
import { MethodView, TakePartView } from '@site/views/method'
import { StoryView } from '@site/views/story'
import { TableView } from '@site/views/table'
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react'

/** A view's props: how it opens another view, optionally at a query (a speaker, a model, a line). */
export interface ViewProps {
    onOpen: (tab: string, query?: string) => void
}

const view = (load: () => Promise<{ default: ComponentType<ViewProps> }>) => lazy(load)
/** Views whose code loads when they are first opened. */
const LATER: Record<string, ComponentType<ViewProps>> = {
    listen: view(() => import('@site/views/listen')),
    words: view(() => import('@site/views/words')),
    tradeoff: view(() => import('@site/views/field')),
    compare: view(() => import('@site/views/compare')),
}

/** False while prerendering and for the first render in the browser, so a view that loads later never suspends the prerendered page. */
function useBrowser(): boolean {
    const [browser, setBrowser] = useState(false)
    useEffect(() => {
        setBrowser(true)
    }, [])
    return browser
}

/** The overview: the story and the other views, each at its own path under BENCH.path. */
export function Overview({ path }: { path: string }) {
    const [tab, select] = useTab(BENCH, TABS, tabFromPath(BENCH, TABS, path) ?? TABS[0].id)
    const browser = useBrowser()
    const Later = LATER[tab]
    return (
        <Shell bench={BENCH} tabs={TABS} tab={tab} onTab={select}>
            {tab === 'story' && <StoryView onOpen={select} />}
            {tab === 'results' && (
                <Page>
                    <TableView />
                </Page>
            )}
            {tab === 'method' && <MethodView />}
            {tab === 'take-part' && <TakePartView />}
            {Later && !browser && <Loading />}
            {Later && browser && (
                <Suspense fallback={<Loading />}>
                    <Later onOpen={select} />
                </Suspense>
            )}
        </Shell>
    )
}
