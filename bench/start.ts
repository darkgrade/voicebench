/**
 * Starts a voicebench run on the worker and prints its id. In Outpost, start runs from the app instead.
 *
 *   bun run bench [-- --models id,id] [--speakers speaker-01,speaker-02] [--force]
 */
import { voicebench } from '@bench/workflow'

const listed = (flag: string): string[] | undefined => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1].split(',') : undefined)
const { start } = await voicebench()
const models = listed('--models')
const speakers = listed('--speakers')
console.log(await start('voicebench', { ...(models ? { models } : {}), ...(speakers ? { speakers } : {}), force: process.argv.includes('--force') }, { label: 'Voicebench' }))
process.exit(0)
