/**
 * From "volunteers' files are in recordings/" to "their recordings are on GitHub":
 *  1. every new file in recordings/ (any format) becomes the next speaker-NN.wav, scrubbed of all
 *     metadata, and the original goes to the Trash;
 *  2. the anonymity check runs on everything staged;
 *  3. it's committed and pushed (the pre-push check runs again).
 * Any failure stops it before anything is committed or pushed. Then run the workflow (Voicebench in
 * Outpost, or `bun run bench`): it transcribes the new recordings with every model and publishes results.
 *
 *   bun run publish
 */
import { ROOT, addRecording, newRecordings } from '@bench/recordings'
import { execFileSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

function run(command: string, argumentsGiven: string[]): void {
    execFileSync(command, argumentsGiven, { cwd: ROOT, stdio: 'inherit' })
}

const added: string[] = []
for (const original of newRecordings()) {
    const id = addRecording(original)
    // To the Trash rather than deleted, in case the conversion needs checking; empty it afterwards.
    renameSync(original, join(homedir(), '.Trash', `${Date.now()}-${basename(original)}`))
    added.push(id)
    console.log(`Added ${id}; the original is in the Trash`)
}

if (!added.length) throw new Error('No new recordings in recordings/')
run('git', ['add', '--all', 'recordings'])
run('bun', ['bench/anonymity.ts', '--staged'])
run('git', ['commit', '-m', `Add ${added.length === 1 ? 'a recording' : `${added.length} recordings`}`])
run('git', ['push'])
console.log('Published. Run the workflow next (Voicebench in Outpost, or bun run bench) to update the results.')
