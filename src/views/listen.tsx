/**
 * Listen: a real person reading the script, with every model's text arriving as it did in the run.
 * Pick a speaker and press play, or click any spoken line to see what each model wrote for it.
 */
import { Button, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import type { ViewProps } from '@site/app'
import { type Heard, type SpeakerTrack, audioPath, listenQuery, scriptFor, speakerName, summary, useHeard, useWaves } from '@site/heard'
import { Loading } from '@site/kit/shell'
import { INK, TYPE } from '@site/kit/theme'
import { Lane, LaneHeadings, phaseOf } from '@site/views/listen/lanes'
import { clock, usePlayer } from '@site/views/listen/player'
import { TranscriptKey } from '@site/views/listen/transcript'
import { type Stretch, Waveform } from '@site/views/listen/waveform'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

/** How long before a line starts it becomes the one on show, in seconds. */
const LEAD_IN = 0.2

/** The spoken line a moment in the recording belongs to: the one being said, or the last one said. */
function lineAt(track: SpeakerTrack, seconds: number): number {
    return Math.max(0, track.utterances.findLastIndex(utterance => utterance.start - LEAD_IN <= seconds))
}

/** What to call a spoken line: the script line it starts with. */
function lineLabel(heard: Heard, track: SpeakerTrack, line: number): string {
    const spoken = track.utterances[line]
    return spoken.last > spoken.first ? String(heard.words[spoken.first].line + 1) : '·'
}

export default function ListenView(_: ViewProps) {
    const loaded = useHeard()
    const waves = useWaves()
    if (loaded instanceof Error) return <p className="p-8 text-sm text-muted-foreground">The recordings couldn't be loaded. Try again in a moment.</p>
    if (!loaded) return <Loading />
    return <Listen heard={loaded} peaks={waves && !(waves instanceof Error) ? waves.speakers : {}} />
}

function Listen({ heard, peaks }: { heard: Heard; peaks: Record<string, number[]> }) {
    const [speaker, setSpeaker] = useState(0)
    const [chosenModel, setChosenModel] = useState<string>()
    /** Whether the address's speaker, model and line have been read yet. */
    const [opened, setOpened] = useState(false)
    const track = heard.speakers[speaker]
    const { bind, time, playing, failed, seek, toggle, restart } = usePlayer(track.seconds)
    const line = lineAt(track, time)
    const spoken = track.utterances[line]

    const chooseLine = useCallback((index: number): void => seek(Math.max(0, track.utterances[Math.max(0, Math.min(track.utterances.length - 1, index))].start - LEAD_IN / 2)), [seek, track])

    function chooseSpeaker(index: number, startAt = 0): void {
        restart(startAt)
        setSpeaker(index)
    }

    // A link can open the view at a speaker, a model and one of the speaker's spoken lines.
    useEffect(() => {
        const query = new URLSearchParams(location.search)
        const wanted = heard.speakers.findIndex(candidate => candidate.id === query.get('speaker'))
        const index = Math.max(0, wanted)
        const utterance = Math.max(0, Math.min(heard.speakers[index].utterances.length - 1, Number(query.get('utterance') ?? 1) - 1))
        if (query.get('model')) setChosenModel(query.get('model')!)
        if (wanted >= 0 || query.get('utterance')) chooseSpeaker(index, Math.max(0, heard.speakers[index].utterances[utterance].start - LEAD_IN / 2))
        setOpened(true)
    }, [heard])

    // The address keeps up with the line on show, so it can be shared.
    useEffect(() => {
        if (playing || !opened) return
        history.replaceState(null, '', `${location.pathname}${listenQuery(track.id, chosenModel, line)}`)
    }, [opened, playing, track, chosenModel, line])

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            const target = event.target instanceof HTMLElement ? event.target : null
            if (target?.closest('[role="tablist"], input, textarea, select')) return
            if (event.key === ' ' && !target?.closest('button, a')) {
                event.preventDefault()
                toggle()
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                chooseLine(line + (event.key === 'ArrowRight' ? 1 : -1))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [toggle, chooseLine, line])

    const stretches: Stretch[] = useMemo(
        () =>
            track.utterances.map((utterance, index) => ({
                start: utterance.start,
                end: utterance.end,
                label: lineLabel(heard, track, index),
                trouble: heard.runs.filter(bySpeaker => bySpeaker[speaker].said[index].marks || bySpeaker[speaker].said[index].ghosts).length / heard.models.length,
            })),
        [heard, track, speaker]
    )

    // Paused, every lane shows how the line ended up; playing, each follows the recording.
    const sinceEnd = playing ? (time - spoken.end) * 1000 : null
    const exact = heard.runs.filter(bySpeaker => !bySpeaker[speaker].said[line].marks && !bySpeaker[speaker].said[line].ghosts).length
    const script = scriptFor(heard, spoken)

    return (
        <div className="flex h-full flex-col" style={{ background: INK.background }}>
            <audio {...bind} src={audioPath(track.id)} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-1 sm:px-8">
                <Button size="icon" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause /> : <Play />}
                </Button>
                <span className={`${TYPE.number} text-sm text-muted-foreground`}>
                    {clock(time)} / {clock(track.seconds)}
                </span>
                <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                    <Tabs value={String(speaker)} onValueChange={value => chooseSpeaker(Number(value))}>
                        <TabsList aria-label="Speaker">
                            {heard.speakers.map((candidate, index) => (
                                <TabsTrigger key={candidate.id} value={String(index)} aria-label={speakerName(candidate.id)}>
                                    <span className="hidden lg:inline">Speaker&nbsp;</span>
                                    {index + 1}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
                {failed && <span className="text-xs text-muted-foreground">This recording couldn't be played. You can still step through its lines.</span>}
            </div>
            <div className="px-4 pt-2 sm:px-8">
                <Waveform peaks={peaks[track.id] ?? []} seconds={track.seconds} stretches={stretches} current={line} time={time} onSeek={seek} onChoose={chooseLine} />
            </div>
            <div className="flex items-start gap-3 px-4 pt-2 pb-2 sm:px-8 sm:pt-3 sm:pb-3">
                <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => chooseLine(line - 1)} disabled={line === 0} aria-label="Previous line">
                        <ChevronLeft />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => chooseLine(line + 1)} disabled={line === track.utterances.length - 1} aria-label="Next line">
                        <ChevronRight />
                    </Button>
                </div>
                <div className="min-w-0">
                    <p className={TYPE.label}>
                        {speakerName(track.id)} · {script ? `line ${lineLabel(heard, track, line)} of ${heard.lines.length}` : 'not in the script'} · {exact} of {heard.models.length} models wrote it exactly
                    </p>
                    <p className="font-heading text-base leading-snug font-semibold tracking-tight text-balance sm:text-lg">{script ? `“${script}”` : 'Something outside the script'}</p>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10">
                <LaneHeadings />
                <ol>
                    {heard.models.map((id, index) => {
                        const said = heard.runs[index][speaker].said[line]
                        const phase = phaseOf(said, sinceEnd)
                        return <Lane key={id} heard={heard} model={summary(id)} rank={index + 1} said={said} phase={phase} sinceEnd={phase === 'waiting' ? (sinceEnd ?? 0) : 0} chosen={id === chosenModel} />
                    })}
                </ol>
                <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-muted-foreground sm:px-8">
                    <TranscriptKey />
                    <span>The bar runs from the end of the line until the text arrives; the gold mark is one second.</span>
                    <span>Space plays and pauses, the arrow keys step through the lines.</span>
                </p>
            </div>
        </div>
    )
}
