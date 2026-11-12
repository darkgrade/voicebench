import script from '../../script/reading-script.md?raw'

const lines = script
    .split('\n')
    .map(line => line.match(/^\d+\.\s+(.*)$/)?.[1])
    .filter((line): line is string => Boolean(line))

const instructions = script
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#') && !/^\d+\./.test(line))

/** The recording instructions and script, exactly as volunteers get them. */
export function TakePart() {
    return (
        <div className="typeset typeset-kevinschaich max-w-2xl">
            <h2>Take part</h2>
            {instructions.map(line => (
                <p key={line}>{line}</p>
            ))}
            <ol>
                {lines.map(line => (
                    <li key={line}>{line}</li>
                ))}
            </ol>
        </div>
    )
}
