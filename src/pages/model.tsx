import { Badge, Card, CardContent, CardHeader, CardTitle, Stat, Tabs, TabsContent, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, MODELS, type AlignedWord, type ModelSummary, modelDetail, percent, seconds } from '@site/data'

/** The script as one model heard it: correct words plain, mistakes marked. */
function HeardText({ alignment }: { alignment: AlignedWord[] }) {
    return (
        <p className="text-sm leading-7">
            {alignment.map((word, index) => {
                if (word.kind === 'same') return <span key={index}>{word.heard} </span>
                if (word.kind === 'missed')
                    return (
                        <span key={index} className="text-muted-foreground line-through decoration-destructive" title="Missed">
                            {word.expected}{' '}
                        </span>
                    )
                if (word.kind === 'added')
                    return (
                        <span key={index} className="rounded bg-destructive/15 px-0.5 text-destructive" title="Added">
                            {word.heard}{' '}
                        </span>
                    )
                return (
                    <span key={index} title={`Should be "${word.expected}"`} className="rounded bg-destructive/15 px-0.5">
                        <span className="text-destructive">{word.heard}</span> <span className="text-muted-foreground line-through">{word.expected}</span>{' '}
                    </span>
                )
            })}
        </p>
    )
}

/** One model's results in detail: headline numbers, each speaker's transcript and every wait. */
export function ModelPage({ model }: { model: ModelSummary }) {
    const detail = modelDetail(model.id)
    const rank = MODELS.indexOf(model) + 1
    const speakers = detail?.speakers ?? []
    return (
        <article className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <a href={BENCH.path} className="text-sm text-muted-foreground hover:underline">
                    ← All models
                </a>
                <h1 className="font-heading text-3xl font-semibold tracking-tight">{model.name}</h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{model.maker}</span>
                    {model.licence && <Badge variant="secondary">{model.licence}</Badge>}
                    {model.mode && <Badge variant="outline">{model.mode}</Badge>}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat boxed size="lg" label="Score" value={model.score ?? '–'} unit="/ 100" sub={`#${rank} of ${MODELS.length} models`} />
                <Stat boxed size="lg" label="Word errors" value={percent(model.wordErrorRate)} />
                <Stat boxed size="lg" label="Typical wait" value={seconds(model.latencyMedianMs)} sub={`slow: ${seconds(model.latencyP90Ms)}`} />
                <Stat boxed size="lg" label="Under a second" value={percent(model.withinTarget, 0)} />
            </div>

            {model.reasons && (
                <section className="flex flex-col gap-3">
                    <h2 className="font-heading text-xl font-semibold">How the score adds up</h2>
                    <div className="flex flex-col gap-2">
                        {model.reasons.map(reason => (
                            <div key={reason.area} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
                                <span className="text-muted-foreground">{reason.area}</span>
                                <div className="flex flex-col gap-1">
                                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full rounded-full bg-foreground" style={{ width: `${reason.score}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {reason.why} · counts {reason.weight}%
                                    </span>
                                </div>
                                <span className="text-right tabular-nums">{reason.score}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {speakers.length > 0 && (
                <section className="flex flex-col gap-3">
                    <h2 className="font-heading text-xl font-semibold">What it heard</h2>
                    <Tabs defaultValue={speakers[0].speaker}>
                        <TabsList>
                            {speakers.map(speaker => (
                                <TabsTrigger key={speaker.speaker} value={speaker.speaker}>
                                    {speaker.speaker.replace('speaker-', 'Speaker ')}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {speakers.map(speaker => (
                            <TabsContent key={speaker.speaker} value={speaker.speaker} className="flex flex-col gap-3">
                                <div className="text-sm text-muted-foreground">
                                    {percent(speaker.wordErrorRate)} word errors: {speaker.errors.substitutions} wrong, {speaker.errors.deletions} missed, {speaker.errors.insertions} added
                                </div>
                                <HeardText alignment={speaker.alignment} />
                                <div className="flex flex-wrap gap-1.5">
                                    {speaker.utterances.map((utterance, index) => (
                                        <Badge key={index} variant={(utterance.latencyMs ?? Infinity) < 1000 ? 'secondary' : 'destructive'} className="tabular-nums" title={utterance.text}>
                                            {seconds(utterance.latencyMs)}
                                        </Badge>
                                    ))}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                </section>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>How it ran</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                    <Stat label="Engine" value={model.engine ?? '–'} />
                    <Stat label="Download" value={model.sizeGigabytes ? `${model.sizeGigabytes.toFixed(2)} GB` : '–'} />
                    <Stat label="Memory used" value={model.peakMemoryGigabytes ? `${model.peakMemoryGigabytes.toFixed(1)} GB` : '–'} />
                    <Stat label="Load time" value={model.loadSeconds !== undefined ? `${model.loadSeconds} s` : '–'} />
                    <Stat
                        label="Model files"
                        value={
                            <a href={model.source} className="break-all hover:underline">
                                {model.files?.map(file => file.name).join(', ') || model.source}
                            </a>
                        }
                        sub={model.files?.map(file => `sha256 ${file.sha256.slice(0, 16)}…`).join(' · ')}
                    />
                </CardContent>
            </Card>
        </article>
    )
}
