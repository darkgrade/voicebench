/**
 * Adds a volunteer's recording without letting anything identifying into the repo. The original file
 * is only read, never copied: its audio is decoded and rewritten as a bare 16-bit mono WAV (no title,
 * location, device, owner, dates or any other tag), named by the next speaker number, and listed in
 * recordings/speakers.json with nothing about the person.
 *
 *   bun run recordings:add -- <original file> [--publish]
 *
 * --publish only when the volunteer agreed to their audio being published; scores are published either way.
 */
import { BYTES_PER_SECOND, RECORDINGS_DIRECTORY, SAMPLE_RATE, type Speaker, readSpeakers } from '@bench/recordings'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const original = process.argv[2]
if (!original || original.startsWith('--') || !existsSync(original)) {
    console.error('usage: bun run recordings:add -- <original file> [--publish]')
    process.exit(2)
}

const speakers = existsSync(join(RECORDINGS_DIRECTORY, 'speakers.json')) ? readSpeakers() : []
const id = `speaker-${String(speakers.length + 1).padStart(2, '0')}`
const file = `${id}.wav`
const destination = join(RECORDINGS_DIRECTORY, file)

// The first audio stream only, every tag, chapter and other stream dropped, written bit-exact so the
// encoder doesn't add its own name either.
execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', original,
    '-map', '0:a:0', '-map_metadata', '-1', '-map_chapters', '-1',
    '-fflags', '+bitexact', '-flags:a', '+bitexact',
    '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', '-f', 'wav', destination,
])

const speaker: Speaker = {
    id,
    file,
    publishAudio: process.argv.includes('--publish'),
}
writeFileSync(join(RECORDINGS_DIRECTORY, 'speakers.json'), `${JSON.stringify([...speakers, speaker], null, 4)}\n`)
const seconds = (readFileSync(destination).length - 44) / BYTES_PER_SECOND
console.log(`Added ${id} (${seconds.toFixed(1)} s). The original file was not copied; delete it or keep it outside this folder.`)
console.log('Check before committing: bun bench/anonymity.ts --staged')
