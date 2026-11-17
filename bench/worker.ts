/**
 * The voicebench worker: serves the workflow's tasks on this Mac (its GPU) until stopped. Outpost runs it
 * from its own copy of this repository and restarts it on new commits; on its own it starts a development engine.
 *
 *   bun run worker
 */
import { voicebench } from '@bench/workflow'

const { serve } = await voicebench()
console.log('voicebench worker: ready')
await serve('voicebench', { slots: 8 })
