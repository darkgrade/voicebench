/**
 * One step from "volunteers' files are in recordings/" to "results are on GitHub":
 *  1. every new file in recordings/ (any format) becomes the next speaker-NN.wav, scrubbed of all
 *     metadata, and the original goes to the Trash;
 *  2. every model transcribes every recording;
 *  3. the anonymity check runs on everything staged;
 *  4. it's committed as "Voicebench" at midnight UTC and pushed (the pre-push check runs again).
 * Any failure stops it before anything is committed or pushed.
 *
 *   bun run publish [-- --models id,id]
 */
import { NEUTRAL_EMAIL, NEUTRAL_NAME } from '@bench/anonymity-identity'
import { ROOT, addRecording, newRecordings } from '@bench/recordings'
import { execFileSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

function run(command: string, argumentsGiven: string[], environment: Record<string, string> = {}): void {
    execFileSync(command, argumentsGiven, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...environment } })
}

const added: string[] = []
for (const original of newRecordings()) {
    const id = addRecording(original)
    // To the Trash rather than deleted, in case the conversion needs checking; empty it afterwards.
    renameSync(original, join(homedir(), '.Trash', `${Date.now()}-${basename(original)}`))
    added.push(id)
    console.log(`Added ${id}; the original is in the Trash`)
}

const models = process.argv.indexOf('--models')
run('bun', ['bench/run.ts', ...(models === -1 ? [] : ['--models', process.argv[models + 1]])])

run('git', ['add', '--all', 'recordings', 'results'])
run('bun', ['bench/anonymity.ts', '--staged'])
const date = `${new Date().toISOString().slice(0, 10)}T00:00:00+0000`
const neutral = { GIT_AUTHOR_NAME: NEUTRAL_NAME, GIT_AUTHOR_EMAIL: NEUTRAL_EMAIL, GIT_AUTHOR_DATE: date, GIT_COMMITTER_NAME: NEUTRAL_NAME, GIT_COMMITTER_EMAIL: NEUTRAL_EMAIL, GIT_COMMITTER_DATE: date }
const message = added.length ? `Add ${added.length === 1 ? 'a recording' : `${added.length} recordings`} and update results` : 'Update results'
run('git', ['commit', '-m', message], neutral)
run('git', ['push'])
console.log('Published.')
