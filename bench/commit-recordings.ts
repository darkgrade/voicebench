/**
 * Commits staged changes as "Voicebench <noreply@darkgrade.com>" dated midnight UTC today, so nothing in
 * the commit (name, email, time of day, timezone) can be matched to when a volunteer sent their file.
 *
 *   bun run recordings:commit -- "Add a recording"
 */
import { NEUTRAL_EMAIL, NEUTRAL_NAME } from '@bench/anonymity-identity'
import { execFileSync } from 'node:child_process'

const message = process.argv[2]
if (!message) {
    console.error('usage: bun run recordings:commit -- "<message>"')
    process.exit(2)
}
const date = `${new Date().toISOString().slice(0, 10)}T00:00:00+0000`
execFileSync('git', ['-c', `user.name=${NEUTRAL_NAME}`, '-c', `user.email=${NEUTRAL_EMAIL}`, 'commit', '--date', date, '-m', message], {
    stdio: 'inherit',
    env: { ...process.env, GIT_COMMITTER_NAME: NEUTRAL_NAME, GIT_COMMITTER_EMAIL: NEUTRAL_EMAIL, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: NEUTRAL_NAME, GIT_AUTHOR_EMAIL: NEUTRAL_EMAIL, GIT_AUTHOR_DATE: date },
})
