import { Card, CardContent, CardHeader, CardTitle, CodeBlock, CodeBlockContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kevinschaich/components'
import { BENCH, RUN } from '@site/data'

const HEADINGS: Record<string, string> = {
    settings: 'Settings',
    wholeUtteranceModels: 'Models that hear a whole line',
    streamingModels: 'Streaming models',
    accuracy: 'Accuracy',
    latencyTarget: 'Speed',
    isolation: 'One model at a time',
    runs: 'Runs',
}

/** How the results were made, from the method recorded in the results file, and how to repeat it. */
export function Method() {
    const speakers = RUN.input?.speakers ?? []
    const hardware = RUN.hardware
    return (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="typeset typeset-kevinschaich">
                <h2>How we test</h2>
                <p>
                    Volunteers read the same script into their own phones. Every recording goes through every model on one Mac, one model at a time, with each engine's default
                    settings. Each model is measured on two things only: how many words it gets wrong, and how long you wait for the text after you stop talking.
                </p>
                {Object.entries(RUN.method ?? {}).map(([key, text]) => (
                    <section key={key}>
                        <h3>{HEADINGS[key] ?? key}</h3>
                        <p>{text}</p>
                    </section>
                ))}
                <h3>Repeat it</h3>
                <p>
                    Everything is in <a href={`https://github.com/${BENCH.repository}`}>the repository</a>: the script, each recording's checksum, every model's source and file
                    checksum, and the exact engine versions. On an Apple Silicon Mac:
                </p>
                <div className="not-typeset">
                    <CodeBlock>
                        <CodeBlockContent>{`git clone https://github.com/${BENCH.repository}\ncd voicebench\nbun install && bun run setup\nbun run bench`}</CodeBlockContent>
                    </CodeBlock>
                </div>
            </div>
            <div className="flex flex-col gap-4">
                {hardware && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Hardware</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            {hardware.chip}, {hardware.memoryGigabytes} GB, macOS {hardware.macOS}
                        </CardContent>
                    </Card>
                )}
                {speakers.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Speakers</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Speaker</TableHead>
                                        <TableHead>Age</TableHead>
                                        <TableHead>Accent</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {speakers.map(speaker => (
                                        <TableRow key={speaker.id}>
                                            <TableCell>{speaker.id}</TableCell>
                                            <TableCell>{speaker.ageRange ?? '–'}</TableCell>
                                            <TableCell>{speaker.accent ?? '–'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
