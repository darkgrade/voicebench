/**
 * The inputs: the reading script and the participants' recordings, each decoded to 16 kHz mono and
 * cut into utterances once (Silero VAD, via bench/runners/find_utterances.py) so every model gets
 * the same cuts.
 */
import { RUNNERS_DIRECTORY } from '@bench/models'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '..')
export const RECORDINGS_DIRECTORY = join(ROOT, 'recordings')
const SCRIPT_PATH = join(ROOT, 'script', 'reading-script.md')
const SPEAKERS_PATH = join(RECORDINGS_DIRECTORY, 'speakers.json')
const UTTERANCE_FINDER = join(ROOT, 'bench', 'runners', 'find_utterances.py')
export const SAMPLE_RATE = 16_000
export const BYTES_PER_SECOND = SAMPLE_RATE * 2

/** What a participant chose to share. Nothing here may identify them. */
export interface Speaker {
    id: string
    /** File name in recordings/, e.g. speaker-01.m4a. */
    file: string
    ageRange?: string
    accent?: string
    device?: string
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
        const wavPath = utterancesPath.replace(/\.utterances\.json$/, '.16k.wav')
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', audioPath, '-ac', '1', '-ar', String(SAMPLE_RATE), wavPath])
        execFileSync(join(RUNNERS_DIRECTORY, 'venv-musci', 'bin', 'python'), [UTTERANCE_FINDER, wavPath, utterancesPath], { stdio: 'inherit' })
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
