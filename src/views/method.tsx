/** Method: how the results were made and the script everyone reads, set as an article with its contents beside it. */
import { RUN } from '@site/data'
import { TYPE } from '@site/kit/theme'
import { Method, METHOD_SECTIONS } from '@site/pages/method'
import { ScriptLines, TakePart } from '@site/pages/take-part'
import type { ReactNode } from 'react'

const METHOD_CONTENTS = [{ id: 'method', heading: 'How we test' }, ...METHOD_SECTIONS.filter(section => RUN.method?.[section.id]), { id: 'repeat', heading: 'Repeat it' }, { id: 'script', heading: 'The script' }]
const TAKE_PART_CONTENTS = [
    { id: 'record', heading: 'How to record' },
    { id: 'read', heading: 'What to read' },
    { id: 'send', heading: "When you're done" },
]

/** A page of reading: the article at a comfortable measure, with the page's contents (and, for the method, the machine) beside it. */
function Reading({ contents, tested = false, children }: { contents: { id: string; heading: string }[]; tested?: boolean; children: ReactNode }) {
    const hardware = tested ? RUN.hardware : undefined
    return (
        <div className="h-full overflow-y-auto scroll-smooth">
            <div className="mx-auto grid max-w-5xl gap-x-16 gap-y-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,37em)_1fr]">
                <article className="typeset typeset-kevinschaich">{children}</article>
                <aside className="row-start-1 flex flex-col gap-6 text-sm lg:sticky lg:top-8 lg:col-start-2 lg:self-start">
                    {hardware && (
                        <div className="flex flex-col gap-1">
                            <p className={TYPE.label}>Tested on</p>
                            <p>
                                {hardware.chip}, {hardware.memoryGigabytes} GB
                            </p>
                            <p className="text-muted-foreground">macOS {hardware.macOS}</p>
                            {RUN.date && <p className="text-muted-foreground">{new Date(RUN.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>}
                        </div>
                    )}
                    <nav className="hidden flex-col gap-1.5 lg:flex" aria-label="On this page">
                        <p className={TYPE.label}>On this page</p>
                        {contents.map(item => (
                            <a key={item.id} href={`#${item.id}`} className="text-muted-foreground hover:text-foreground">
                                {item.heading}
                            </a>
                        ))}
                    </nav>
                </aside>
            </div>
        </div>
    )
}

export function MethodView() {
    return (
        <Reading contents={METHOD_CONTENTS} tested>
            <Method />
            <h2 id="script">The script</h2>
            <p>Twenty things people say to a voice assistant, read once by every speaker.</p>
            <ScriptLines />
        </Reading>
    )
}

export function TakePartView() {
    return (
        <Reading contents={TAKE_PART_CONTENTS}>
            <TakePart />
        </Reading>
    )
}
