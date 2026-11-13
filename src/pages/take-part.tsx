import { BENCH } from '@site/data'
import { SCRIPT, SCRIPT_MARKDOWN } from '@site/script'

/** The instructions volunteers get: how to record, then what to do with the recording. */
const [recording = '', ...afterwards] = SCRIPT_MARKDOWN.split('\n').filter(line => line.trim() && !line.startsWith('#') && !/^\d+\./.test(line))
const steps = recording.split(/(?<=[.!?])\s+/).filter(Boolean)

/** What a new issue starts with, so a volunteer only has to attach the file and tick the boxes. */
const ISSUE_TITLE = 'Recording for Voicebench'
const ISSUE_BODY = [
    'I read the Voicebench script and would like my recording added.',
    '',
    '### Recording',
    '',
    "Drag the file onto this box to attach it. If GitHub won't take the file type (Voice Memos saves .m4a), zip it first and attach the zip.",
    '',
    '### Before sending',
    '',
    '- [ ] I read every line of the script, in order, at my normal pace, in a quiet room.',
    '- [ ] I agree to this recording being published with the Voicebench results, without my name.',
    '',
    '### Anything we should know (optional)',
    '',
    'For example, a line you stumbled on. Please leave out anything personal: this issue is public.',
].join('\n')

/** A new issue on the bench's repository, with its title and description filled in. */
export const ISSUE_LINK = `https://github.com/${BENCH.repository}/issues/new?${new URLSearchParams({ title: ISSUE_TITLE, body: ISSUE_BODY })}`

/** The lines everyone reads, in order. */
export function ScriptLines() {
    return (
        <ol>
            {SCRIPT.lines.map(line => (
                <li key={line}>{line}</li>
            ))}
        </ol>
    )
}

/** The recording instructions and script, exactly as volunteers get them. */
export function TakePart() {
    return (
        <>
            <h2 id="take-part">Take part</h2>
            <p>Add your voice: read the script below into your phone. It takes a couple of minutes. Your recording is published with the results, without your name or anything else about you.</p>
            <h3 id="record">How to record</h3>
            <ol>
                {steps.map(step => (
                    <li key={step}>{step}</li>
                ))}
            </ol>
            <h3 id="read">What to read</h3>
            <ScriptLines />
            <h3 id="send">When you're done</h3>
            {afterwards.map(line => (
                <p key={line}>{line}</p>
            ))}
            <p>
                Not in touch with us already? <a href={ISSUE_LINK}>Send your recording as an issue on GitHub</a>: the issue opens ready to fill in, and you attach the file there. An issue is public and
                shows your GitHub username; the published recording and the results never do.
            </p>
        </>
    )
}
