import { CodeBlock, CodeBlockContent } from '@kevinschaich/components'
import { BENCH, MODELS, RUN, SAMPLE, sampleSentence } from '@site/data'

export const METHOD_SECTIONS: { id: string; heading: string }[] = [
    { id: 'settings', heading: 'Settings' },
    { id: 'wholeUtteranceModels', heading: 'Models that hear a whole line' },
    { id: 'streamingModels', heading: 'Streaming models' },
    { id: 'accuracy', heading: 'Accuracy' },
    { id: 'latencyTarget', heading: 'Speed' },
    { id: 'score', heading: 'The score' },
    { id: 'isolation', heading: 'One model at a time' },
    { id: 'runs', heading: 'Runs' },
]

/** Text from the results file, with `code` in backticks set as code. */
export function Prose({ text }: { text: string }) {
    return <p>{text.split('`').map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part))}</p>
}

/** A line of the method that names a command, address or flag, with those set as code. */
function Technical({ text }: { text: string }) {
    const parts = text.split(/(POST \/v1\/audio\/transcriptions|\/v1\/realtime|--reasoning off|--auto-download|llama-server)/)
    return <p>{parts.map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part))}</p>
}

/** How the results were made, from the method recorded in the results file, and how to repeat it. */
export function Method() {
    const method = RUN.method ?? {}
    const areas = MODELS[0]?.reasons ?? []
    return (
        <>
            <h2 id="method">How we test</h2>
            <p>
                Volunteers read the same script into their own phones. Every recording goes through every model on one Mac, one model at a time, with each engine's default settings. Each
                model is measured on two things only: how many words it gets wrong, and how long you wait for the text after you stop talking.
            </p>
            <p>{SAMPLE.speakers ? sampleSentence() : 'English only for now.'}</p>
            {METHOD_SECTIONS.filter(section => method[section.id]).map(section => (
                <section key={section.id}>
                    <h3 id={section.id}>{section.heading}</h3>
                    {method[section.id].includes('`') ? <Prose text={method[section.id]} /> : <Technical text={method[section.id]} />}
                    {section.id === 'score' && areas.length > 0 && (
                        <table>
                            <thead>
                                <tr>
                                    <th>Area</th>
                                    <th>Counts for</th>
                                </tr>
                            </thead>
                            <tbody>
                                {areas.map(area => (
                                    <tr key={area.area}>
                                        <td>{area.area}</td>
                                        <td>{area.weight}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            ))}
            <section>
                <h3 id="repeat">Repeat it</h3>
                <p>
                    Everything is in <a href={`https://github.com/${BENCH.repository}`}>the repository</a>: the script, each recording's checksum, every model's source and file checksum, and
                    the exact engine versions. On an Apple Silicon Mac:
                </p>
                <div className="not-typeset">
                    <CodeBlock>
                        <CodeBlockContent>{`git clone https://github.com/${BENCH.repository}\ncd voicebench\nbun install && bun run setup\nbun run bench`}</CodeBlockContent>
                    </CodeBlock>
                </div>
            </section>
        </>
    )
}
