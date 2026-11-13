/** What a model wrote for one spoken line, set against the script: wrong words, dropped words as ghosts, added words. */
import { OUTCOMES } from '@site/heard'
import { type Piece, type Said, type Word, pieces } from '@site/spoken'

/** The words in order, with each stretch of words heard right joined into one piece. */
function runs(words: Piece[]): Piece[] {
    const joined: Piece[] = []
    for (const word of words) {
        const last = joined[joined.length - 1]
        if (word.outcome === 'right' && last?.outcome === 'right') last.text = `${last.text} ${word.text}`
        else joined.push({ ...word })
    }
    return joined
}

export function Transcript({ script, said }: { script: Word[]; said: Said }) {
    const words = runs(pieces(script, said))
    if (!words.length) return <span className="text-muted-foreground">Nothing</span>
    return (
        <>
            {words.map((piece, index) => {
                if (piece.outcome === 'right') return <span key={index}>{piece.text} </span>
                if (piece.outcome === 'dropped')
                    return (
                        <span key={index}>
                            <span className="rounded border border-dashed px-1 opacity-80" style={{ color: OUTCOMES.dropped.color, borderColor: OUTCOMES.dropped.color }} title="Dropped">
                                {piece.text}
                            </span>{' '}
                        </span>
                    )
                return (
                    <span key={index}>
                        <span className="rounded px-1 font-medium" style={{ color: OUTCOMES[piece.outcome].color, background: 'oklch(1 0 0 / 0.07)' }} title={piece.outcome === 'added' ? 'Added' : `The script says “${piece.expected}”`}>
                            {piece.text}
                        </span>
                        {piece.expected && <span className="ml-1 text-xs text-muted-foreground line-through">{piece.expected}</span>}{' '}
                    </span>
                )
            })}
        </>
    )
}

/** The colours a transcript uses, as a small legend. */
export function TranscriptKey() {
    return (
        <>
            {(['wrong', 'dropped', 'added'] as const).map(outcome => (
                <span key={outcome} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: OUTCOMES[outcome].color }} />
                    {OUTCOMES[outcome].label}
                </span>
            ))}
        </>
    )
}
