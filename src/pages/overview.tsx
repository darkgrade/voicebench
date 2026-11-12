import {
    Badge,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Leaderboard,
    type LeaderboardColumn,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    TradeoffChart,
} from '@kevinschaich/components'
import { BENCH, FILTERS, TABS, MODELS, type ModelSummary, RUN, percent, sampleSentence, seconds } from '@site/data'
import { Method } from '@site/pages/method'
import { TakePart } from '@site/pages/take-part'
import { useEffect, useState } from 'react'

const COLUMNS: LeaderboardColumn<ModelSummary>[] = [
    {
        key: 'model',
        label: 'Model',
        render: model => (
            <a href={`${BENCH.path}${model.id}/`} className="flex flex-col hover:underline">
                <span className="font-medium text-foreground">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.maker}</span>
            </a>
        ),
    },
    { key: 'score', label: 'Score', hint: 'out of 100', better: 'higher', value: model => model.score ?? null, render: model => <span className="font-semibold">{model.score ?? '–'}</span> },
    { key: 'accuracy', label: 'Word errors', hint: 'lower is better', value: model => model.wordErrorRate ?? null, render: model => percent(model.wordErrorRate) },
    { key: 'latency', label: 'Typical wait', hint: 'after you stop talking', value: model => model.latencyMedianMs ?? null, render: model => seconds(model.latencyMedianMs) },
    { key: 'slow', label: 'Slow wait', hint: '1 in 10 is slower', value: model => model.latencyP90Ms ?? null, render: model => seconds(model.latencyP90Ms) },
    { key: 'fast', label: 'Under a second', better: 'higher', value: model => model.withinTarget ?? null, render: model => percent(model.withinTarget, 0) },
    { key: 'size', label: 'Download', value: model => model.sizeGigabytes ?? null, render: model => (model.sizeGigabytes ? `${model.sizeGigabytes.toFixed(1)} GB` : '–') },
    {
        key: 'licence',
        label: 'Licence',
        render: model => (
            <Badge variant={model.licence?.includes('NC') ? 'outline' : 'secondary'} className="whitespace-nowrap">
                {model.licence ?? '–'}
            </Badge>
        ),
    },
]

/** The tab a path under BENCH.path names; the first tab is the bench's root. */
export function tabFromPath(path: string): string | undefined {
    const id = path.replace(BENCH.path, '').replace(/\/$/, '')
    if (!id) return TABS[0].id
    return TABS.some(tab => tab.id === id) ? id : undefined
}

const tabPath = (id: string): string => (id === TABS[0].id ? BENCH.path : `${BENCH.path}${id}/`)

/** One row of filters per category, each a one-of-a-few choice. */
function Filters({ chosen, choose }: { chosen: Record<string, string>; choose: (filter: string, option: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {FILTERS.map(filter => (
                <Tabs key={filter.id} value={chosen[filter.id]} onValueChange={value => choose(filter.id, String(value))}>
                    <TabsList aria-label={filter.label}>
                        {filter.options.map(option => (
                            <TabsTrigger key={option.id} value={option.id}>
                                {option.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            ))}
        </div>
    )
}

export function Overview({ initialTab }: { initialTab: string }) {
    const [tab, setTab] = useState(initialTab)
    const [chosen, setChosen] = useState<Record<string, string>>(Object.fromEntries(FILTERS.map(filter => [filter.id, 'all'])))
    const shown = MODELS.filter(model => FILTERS.every(filter => filter.options.find(option => option.id === chosen[filter.id])!.matches(model)))
    const choose = (filter: string, option: string) => setChosen(previous => ({ ...previous, [filter]: option }))
    useEffect(() => {
        const legacy = location.hash.replace(/^#/, '')
        if (TABS.some(item => item.id === legacy)) {
            history.replaceState(null, '', tabPath(legacy))
            setTab(legacy)
        }
        const onPop = () => setTab(tabFromPath(location.pathname) ?? TABS[0].id)
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])
    const select = (id: string) => {
        setTab(id)
        history.pushState(null, '', tabPath(id))
    }

    return (
        <Tabs value={tab} onValueChange={value => select(String(value))} className="flex flex-col gap-6">
            <TabsList>
                {TABS.map(item => (
                    <TabsTrigger key={item.id} value={item.id}>
                        {item.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value="results" className="flex flex-col gap-3">
                {MODELS.length === 0 ? (
                    <Empty className="border">
                        <EmptyHeader>
                            <EmptyTitle>Results are on the way</EmptyTitle>
                            <EmptyDescription>Volunteers are recording the script now, in English to start. Check back soon.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : (
                    <>
                        <Filters chosen={chosen} choose={choose} />
                        <Leaderboard rows={shown} rowKey={model => model.id} defaultSort="score" columns={COLUMNS} />
                        <p className="text-sm text-muted-foreground">
                            {sampleSentence()} Everyone read the same twenty things people say to a voice assistant. The score, out of 100, weighs accuracy most, then speed. Word errors count every word a model got wrong, missed or added. The wait is how
                            long after each line its full text arrived, on {RUN.hardware?.chip ?? 'a Mac'}. Pick a model to see every line it heard.
                        </p>
                    </>
                )}
            </TabsContent>
            <TabsContent value="tradeoff" className="flex flex-col gap-3">
                <Filters chosen={chosen} choose={choose} />
                <TradeoffChart
                    points={shown.filter(model => model.latencyMedianMs).map(model => ({ id: model.id, label: model.name, x: model.latencyMedianMs!, y: model.wordErrorRate! }))}
                    xLabel="Typical wait"
                    yLabel="Word errors"
                    xScale="log"
                    formatX={value => seconds(value)}
                    formatY={value => percent(value, 0)}
                    onSelect={id => location.assign(`${BENCH.path}${id}/`)}
                />
                <p className="text-sm text-muted-foreground">Closer to the bottom left is better: fewer mistakes, less waiting.</p>
            </TabsContent>
            <TabsContent value="method">
                <Method />
            </TabsContent>
            <TabsContent value="take-part">
                <TakePart />
            </TabsContent>
        </Tabs>
    )
}
