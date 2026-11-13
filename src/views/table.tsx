/** Every model as a sortable table, with the filters: the plain view of the results. */
import { Badge, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Leaderboard, type LeaderboardColumn, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, FILTERS, MODELS, type ModelSummary, RUN, percent, sampleSentence, seconds } from '@site/data'
import { useState } from 'react'

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

/** One row of filters per category, each a one-of-a-few choice. */
export function Filters({ chosen, choose }: { chosen: Record<string, string>; choose: (filter: string, option: string) => void }) {
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

/** The models a set of filter choices leaves. */
export function useFilters(): { chosen: Record<string, string>; choose: (filter: string, option: string) => void; shown: ModelSummary[] } {
    const [chosen, setChosen] = useState<Record<string, string>>(Object.fromEntries(FILTERS.map(filter => [filter.id, 'all'])))
    const shown = MODELS.filter(model => FILTERS.every(filter => filter.options.find(option => option.id === chosen[filter.id])!.matches(model)))
    const choose = (filter: string, option: string) => setChosen(previous => ({ ...previous, [filter]: option }))
    return { chosen, choose, shown }
}

export function TableView() {
    const { chosen, choose, shown } = useFilters()
    if (MODELS.length === 0)
        return (
            <Empty className="border">
                <EmptyHeader>
                    <EmptyTitle>Results are on the way</EmptyTitle>
                    <EmptyDescription>Volunteers are recording the script now, in English to start. Check back soon.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    return (
        <div className="flex flex-col gap-3">
            <Filters chosen={chosen} choose={choose} />
            <Leaderboard rows={shown} rowKey={model => model.id} defaultSort="score" columns={COLUMNS} />
            <p className="text-sm text-muted-foreground">
                {sampleSentence()} Everyone read the same twenty things people say to a voice assistant. The score, out of 100, weighs accuracy most, then speed. Word errors count every word a model got wrong, missed or added. The wait is how
                long after each line its full text arrived, on {RUN.hardware?.chip ?? 'a Mac'}. Pick a model to see every line it heard.
            </p>
        </div>
    )
}
