/**
 * Hear it: one model's transcript of each speaker, line by line as spoken, against the script, with
 * each line's wait. The recording plays in place; every speaker's lines are in the page.
 */
import { Button, Tabs, TabsList, TabsTrigger } from '@kevinschaich/components'
import { BENCH, type ErrorCounts, type ModelSummary, percent, seconds } from '@site/data'
import { audioPath, listenQuery, speakerName, useWaves } from '@site/heard'
import { INK, TONE, TYPE } from '@site/kit/theme'
import type { Said, Word } from '@site/spoken'
import { TARGET, barShare } from '@site/views/listen/lanes'
import { clock, usePlayer } from '@site/views/listen/player'
import { Transcript, TranscriptKey } from '@site/views/listen/transcript'
import { type Stretch, Waveform } from '@site/views/listen/waveform'
import { Pause, Play } from 'lucide-react'
import { useState } from 'react'

export interface HeardSpeaker {
    id: string
    seconds: number
    wordErrorRate: number
    errors: ErrorCounts
    lines: { start: number; end: number; said: Said }[]
}

const LEAD_IN = 0.2

export function Hear({ model, script, speakers }: { model: ModelSummary; script: Word[]; speakers: HeardSpeaker[] }) {
    const [active, setActive] = useState(0)
    const speaker = speakers[active]
    const { bind, time, playing, failed, seek, toggle, restart } = usePlayer(speaker.seconds)
    const waves = useWaves()
    const peaks = waves && !(waves instanceof Error) ? (waves.speakers[speaker.id] ?? []) : []
    const current = Math.max(0, speaker.lines.findLastIndex(line => line.start - LEAD_IN <= time))
    const stretches: Stretch[] = speaker.lines.map((line, index) => ({ start: line.start, end: line.end, label: String(index + 1), trouble: line.said.marks || line.said.ghosts ? 1 : 0 }))
    const play = (line: number): void => seek(Math.max(0, speaker.lines[line].start - LEAD_IN / 2))

    return (
        <div className="flex flex-col gap-4">
            <audio {...bind} src={audioPath(speaker.id)} />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button size="icon" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause /> : <Play />}
                </Button>
                <span className={`${TYPE.number} text-sm text-muted-foreground`}>
                    {clock(time)} / {clock(speaker.seconds)}
                </span>
                <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
                    <Tabs
                        value={String(active)}
                        onValueChange={value => {
                            restart()
                            setActive(Number(value))
                        }}
                    >
                        <TabsList aria-label="Speaker">
                            {speakers.map((candidate, index) => (
                                <TabsTrigger key={candidate.id} value={String(index)} aria-label={speakerName(candidate.id)}>
                                    <span className="hidden lg:inline">Speaker&nbsp;</span>
                                    {index + 1}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
                <a href={`${BENCH.path}listen/${listenQuery(speaker.id, model.id, current)}`} className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline">
                    Hear every model on this line →
                </a>
            </div>
            {failed && <p className="text-xs text-muted-foreground">This recording couldn't be played. Its lines are below.</p>}
            <Waveform peaks={peaks} seconds={speaker.seconds} stretches={stretches} current={current} time={time} onSeek={seek} onChoose={play} />
            {speakers.map((candidate, index) => (
                <div key={candidate.id} hidden={index !== active} className="flex flex-col gap-2">
                    <h3 className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{speakerName(candidate.id)}</span> · {percent(candidate.wordErrorRate)} word errors: {candidate.errors.substitutions} wrong, {candidate.errors.deletions} dropped,{' '}
                        {candidate.errors.insertions} added
                    </h3>
                    <ol className="flex flex-col">
                        {candidate.lines.map((line, position) => {
                            const late = line.said.wait === null || line.said.wait >= TARGET
                            return (
                                <li
                                    key={position}
                                    onClick={() => play(position)}
                                    className={`grid cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-white/6 px-2 py-2 hover:bg-white/[0.04] sm:grid-cols-[1.5rem_8.5rem_minmax(0,1fr)] ${index === active && position === current ? 'bg-white/[0.06]' : ''}`}
                                >
                                    <span className={`${TYPE.number} text-xs text-muted-foreground`}>{position + 1}</span>
                                    <span className="col-start-2 row-start-2 flex items-center gap-2 sm:row-start-1">
                                        <span className="relative h-1.5 w-20 shrink-0 rounded-full bg-white/10">
                                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${barShare(line.said.wait ?? Infinity) * 100}%`, background: late ? TONE.bad : TONE.good }} />
                                            <span className="absolute -inset-y-1 w-px" style={{ left: `${barShare(TARGET) * 100}%`, background: INK.accent }} />
                                        </span>
                                        <span className={`${TYPE.number} text-xs text-muted-foreground`}>{line.said.wait === null ? 'no text' : seconds(line.said.wait)}</span>
                                    </span>
                                    <p className="col-start-2 text-sm leading-relaxed sm:col-start-3">
                                        <Transcript script={script} said={line.said} />
                                    </p>
                                </li>
                            )
                        })}
                    </ol>
                </div>
            ))}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <TranscriptKey />
                <span>The bar is the wait from the end of the line to its text; the gold mark is one second. Pick a line to hear it.</span>
            </p>
        </div>
    )
}
