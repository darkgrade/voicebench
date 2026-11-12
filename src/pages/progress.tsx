/**
 * The live progress of a benchmark run, for the dev server only: it reads results/raw/progress.json
 * (served by vite.config.ts) every second. Never prerendered or published.
 */
import { Badge, Card, CardContent, CardHeader, CardTitle, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Progress, ProgressLabel, ProgressValue, Stat, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kevinschaich/components'
import { type ProgressFile, timeLeftMs } from '@bench/progress-shape'
import { BENCH } from '@site/data'
import { useEffect, useState } from 'react'

function duration(milliseconds: number | null | undefined): string {
    if (milliseconds === null || milliseconds === undefined) return '–'
    const seconds = Math.round(milliseconds / 1000)
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ${seconds % 60} s`
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' | 'default' }> = {
    waiting: { label: 'Waiting', variant: 'outline' },
    running: { label: 'Running', variant: 'default' },
    done: { label: 'Done', variant: 'secondary' },
    failed: { label: 'Failed', variant: 'destructive' },
}

function useProgress(): { progress: ProgressFile | null; now: number } {
    const [progress, setProgress] = useState<ProgressFile | null>(null)
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        let active = true
        const load = async () => {
            try {
                const response = await fetch(`${BENCH.path}progress.json`, { cache: 'no-store' })
                if (active && response.ok) setProgress((await response.json()) as ProgressFile)
            } catch {
                // the run may be between writes; try again next tick
            }
            if (active) setNow(Date.now())
        }
        void load()
        const timer = setInterval(load, 1000)
        return () => {
            active = false
            clearInterval(timer)
        }
    }, [])
    return { progress, now }
}

export function ProgressPage() {
    const { progress, now } = useProgress()
    if (!progress) {
        return (
            <Empty className="border">
                <EmptyHeader>
                    <EmptyTitle>No run yet</EmptyTitle>
                    <EmptyDescription>Start one with `bun run bench`; this page follows it live.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }
    const finished = progress.models.filter(model => model.status === 'done' || model.status === 'failed').length
    const current = progress.current
    const currentModel = progress.models.find(model => model.id === current?.model)
    const running = !progress.finishedAt
    const left = running ? timeLeftMs(progress, now) : 0
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
                <h1 className="font-heading text-2xl font-semibold">{running ? 'Running' : 'Finished'}</h1>
                {running && <span className="size-2 animate-pulse rounded-full bg-foreground" aria-hidden />}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat boxed label="Models done" value={`${finished}/${progress.models.length}`} />
                <Stat boxed label="Running for" value={duration((progress.finishedAt ?? now) - progress.startedAt)} />
                <Stat boxed label="Time left" value={running ? (left === null ? 'After the first model' : duration(left)) : 'Done'} />
                <Stat boxed label="Last update" value={`${duration(now - progress.updatedAt)} ago`} />
            </div>

            <Progress value={(finished / progress.models.length) * 100}>
                <ProgressLabel>All models</ProgressLabel>
                <ProgressValue />
            </Progress>

            {current && currentModel && (
                <Card>
                    <CardHeader>
                        <CardTitle>{currentModel.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <Progress value={current.steps ? (current.step / current.steps) * 100 : 0}>
                            <ProgressLabel>
                                Step {current.step} of {current.steps}
                            </ProgressLabel>
                            <ProgressValue />
                        </Progress>
                        <div className="text-sm text-muted-foreground">
                            {current.label} · running for {duration(now - current.startedAt)}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="flex flex-col gap-2">
                    <h2 className="font-heading text-lg font-semibold">Models</h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Model</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Result</TableHead>
                                <TableHead className="text-right">Took</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {progress.models.map(model => (
                                <TableRow key={model.id}>
                                    <TableCell className="font-medium">{model.name}</TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS[model.status].variant}>{STATUS[model.status].label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm whitespace-normal text-muted-foreground">
                                        {model.error ??
                                            Object.entries(model.result ?? {})
                                                .map(([key, value]) => `${key} ${value}`)
                                                .join(' · ')}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {model.startedAt ? duration((model.finishedAt ?? now) - model.startedAt) : ''}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </section>
                <section className="flex flex-col gap-2">
                    <h2 className="font-heading text-lg font-semibold">Latest steps</h2>
                    <div className="flex flex-col gap-1.5">
                        {progress.recent.map(step => (
                            <div key={`${step.at}-${step.label}`} className="flex items-start gap-2 text-sm">
                                <span className={step.passed === false ? 'text-destructive' : step.passed ? 'text-foreground' : 'text-muted-foreground'}>
                                    {step.passed === false ? '✗' : step.passed ? '✓' : '·'}
                                </span>
                                <div className="flex min-w-0 flex-col">
                                    <span className="truncate">{step.label}</span>
                                    {step.note && <span className={`truncate text-xs ${step.passed === false ? 'text-destructive' : 'text-muted-foreground'}`}>{step.note}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}
