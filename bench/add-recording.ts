/**
 * Adds one recording as the next speaker (see addRecording). Usually you want `bun run publish`, which
 * adds everything in recordings/, runs the models, commits and pushes in one step.
 *
 *   bun run recordings:add -- <file>
 */
import { addRecording } from '@bench/recordings'
import { existsSync } from 'node:fs'

const original = process.argv[2]
if (!original || !existsSync(original)) {
    console.error('usage: bun run recordings:add -- <file>')
    process.exit(2)
}
console.log(`Added ${addRecording(original)}. Delete the original: it was not copied.`)
