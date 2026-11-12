/**
 * The inputs: the reading script and the participants' recordings, each decoded to 16 kHz mono and
 * cut into utterances once (Silero VAD, via bench/runners/find_utterances.py) so every model gets
 * the same cuts.
 */
import { RUNNERS_DIRECTORY } from '@bench/models'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..')
export const RECORDINGS_DIRECTORY = join(ROOT, 'recordings')
const SCRIPT_PATH = join(ROOT, 'script', 'reading-script.md')
const SPEAKERS_PATH = join(RECORDINGS_DIRECTORY, 'speakers.json')
const UTTERANCE_FINDER = join(ROOT, 'bench', 'runners', 'find_utterances.py')
export const SAMPLE_RATE = 16_000
export const BYTES_PER_SECOND = SAMPLE_RATE * 2

/** A participant: only a number and their file. Being in recordings/ means they agreed to publish. */
export interface Speaker {
    id: string
    /** File name in recordings/, e.g. speaker-01.m4a. */
    file: string
    /** Whether their audio may be published (scores are published for everyone). */
    publishAudio: boolean
}

export interface Utterance {
    startSeconds: number
    endSeconds: number
}

export interface Recording {
    speaker: Speaker
    path: string
    pcm: Buffer
    utterances: Utterance[]
    utterancesPath: string
}

/** The numbered lines of the reading script, joined: the answer key for every recording. */
export function referenceText(): string {
    return readFileSync(SCRIPT_PATH, 'utf8')
        .split('\n')
        .map(line => line.match(/^\d+\.\s+(.*)$/)?.[1])
        .filter((line): line is string => Boolean(line))
        .join(' ')
}

export function scriptPath(): string {
    return SCRIPT_PATH
}

export function readSpeakers(): Speaker[] {
    if (!existsSync(SPEAKERS_PATH)) throw new Error('recordings/speakers.json is missing: list each recording there first')
    return JSON.parse(readFileSync(SPEAKERS_PATH, 'utf8')) as Speaker[]
}

function decode(path: string): Buffer {
    return execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 30 })
}

/** Utterance boundaries live beside the recording (speaker-01.utterances.json) and are committed. */
function findUtterances(audioPath: string, utterancesPath: string): Utterance[] {
    if (!existsSync(utterancesPath)) {
        // recordings:add already wrote 16 kHz mono 16-bit WAV, which is what the detector reads.
        execFileSync(join(RUNNERS_DIRECTORY, 'venv-musci', 'bin', 'python'), [UTTERANCE_FINDER, audioPath, utterancesPath], { stdio: 'inherit' })
    }
    return (JSON.parse(readFileSync(utterancesPath, 'utf8')) as { utterances: Utterance[] }).utterances
}

export function loadRecordings(): Recording[] {
    return readSpeakers().map(speaker => {
        const path = join(RECORDINGS_DIRECTORY, speaker.file)
        if (!existsSync(path)) throw new Error(`recordings/${speaker.file} (${speaker.id}) is missing`)
        const utterancesPath = join(RECORDINGS_DIRECTORY, `${speaker.id}.utterances.json`)
        return { speaker, path, pcm: decode(path), utterances: findUtterances(path, utterancesPath), utterancesPath }
    })
}

/** Names that belong in recordings/; anything else there is a new recording waiting to be added. */
const KNOWN = /^(speakers\.json|reviewed-speech\.json|\.gitkeep|speaker-\d{2}\.wav|speaker-\d{2}\.utterances\.json)$/

/** Files dropped into recordings/ that haven't been added yet, oldest first. */
export function newRecordings(): string[] {
    return readdirSync(RECORDINGS_DIRECTORY)
        .filter(name => !KNOWN.test(name) && !name.startsWith('.'))
        .map(name => join(RECORDINGS_DIRECTORY, name))
        .sort((first, second) => statSync(first).mtimeMs - statSync(second).mtimeMs)
}

/**
 * Adds one recording as the next speaker. The audio is decoded and rewritten as a bare 16-bit mono WAV
 * (first audio stream only; every tag, chapter and other stream dropped; written bit-exact so not even
 * the encoder's name is added), so nothing about the phone, its owner, the time or place comes along.
 * Works for any format the phone sent (M4A, CAF, MP3, WAV …). Returns the new speaker id.
 */
export function addRecording(original: string): string {
    const speakersPath = join(RECORDINGS_DIRECTORY, 'speakers.json')
    const speakers = existsSync(speakersPath) ? readSpeakers() : []
    const id = `speaker-${String(speakers.length + 1).padStart(2, '0')}`
    const file = `${id}.wav`
    execFileSync('ffmpeg', [
        '-v', 'error', '-y', '-i', original,
        '-map', '0:a:0', '-map_metadata', '-1', '-map_chapters', '-1',
        '-fflags', '+bitexact', '-flags:a', '+bitexact',
        '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', '-f', 'wav', join(RECORDINGS_DIRECTORY, file),
    ])
    writeFileSync(speakersPath, `${JSON.stringify([...speakers, { id, file, publishAudio: true }], null, 4)}\n`)
    return id
}
