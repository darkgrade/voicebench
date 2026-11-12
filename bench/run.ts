/**
 * Runs every speech model over every participant's recording and writes results/voicebench.json.
 *
 *   bun run bench [-- --models id,id]
 *
 * Each model starts once on its own server, gets one untimed warm-up utterance, then transcribes
 * every recording:
 *  - Whole-utterance models receive each utterance alone, the moment it ends; latency is the request.
 *  - Streaming models (llama-realtime) hear each recording at real speed in one session; latency is
 *    from the end of each utterance to its last word.
 * Accuracy is pooled over every speaker's words. See AGENTS.md "Bench conventions".
 */
import { type RunningServer, freePort, startEngine, startServer } from '@bench/engines'
import { CRISPASR_BINARY, CRISPASR_MODELS, LLAMA_MODELS, LLAMA_SERVER_BINARY, RUNNERS_DIRECTORY, VOICE_MODELS, type VoiceModel } from '@bench/models'
import { BYTES_PER_SECOND, ROOT, SAMPLE_RATE, type Recording, type Utterance, loadRecordings, referenceText, scriptPath } from '@bench/recordings'
import { type ErrorCounts, align, errorRate, scoreTranscript, sumCounts } from '@bench/scoring'
import { voiceScore } from '@bench/voice-score'
import { failModel, finishModel, finishRun, startModel, startRun, stepDone, stopModel, stopRequested } from '@bench/progress'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RESULTS_PATH = join(ROOT, 'results', 'voicebench.json')
const RAW_DIRECTORY = join(ROOT, 'results', 'raw')
/** Published per-model detail: each speaker's transcript aligned with the script, and each utterance's wait. */
const MODEL_DIRECTORY = join(ROOT, 'results', 'models')
const RUNNER_SCRIPT = join(ROOT, 'bench', 'runners', 'transcription_server.py')
const RESULTS_VERSION = 1
const BLOCK_SECONDS = 0.08
const REQUEST_TIMEOUT_MS = 120_000
/** "Words show up in under a second." */
const LATENCY_TARGET_MS = 1000
/** A streaming model's words for an utterance are those arriving before the next one starts, at most this long after it ends. */
const STREAM_SETTLE_SECONDS = 5
/** Thinking off for every model that has it, as in Toolbench: transcripts have to arrive at once. */
const THINKING_OFF = ['--reasoning', 'off']
const ENGINE_EXECUTABLES = new Set(['llama-server', 'crispasr', 'local-ai'])

interface UtteranceResult extends Utterance {
    text: string
    /** From the end of the utterance until its final text was available. */
    latencyMs: number | null
    error?: string
}

function wavFile(pcm: Buffer): Buffer {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + pcm.length, 4)
    header.write('WAVEfmt ', 8)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(SAMPLE_RATE, 24)
    header.writeUInt32LE(BYTES_PER_SECOND, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36)
    header.writeUInt32LE(pcm.length, 40)
    return Buffer.concat([header, pcm])
}

function slice(pcm: Buffer, utterance: Utterance): Buffer {
    return pcm.subarray(Math.floor(utterance.startSeconds * SAMPLE_RATE) * 2, Math.floor(utterance.endSeconds * SAMPLE_RATE) * 2)
}

/** Output formats some models wrap around the words: Qwen3-ASR's "language English<asr_text>", VibeVoice's "Speaker 0:". */
function withoutMarkup(text: string): string {
    return text
        .replace(/^\s*language \w+(?=<)/i, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\bSpeaker \d+:\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

async function transcribe(url: string, audio: Buffer): Promise<string> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wavFile(audio))], { type: 'audio/wav' }), 'utterance.wav')
    form.append('model', 'default')
    form.append('response_format', 'json')
    const response = await fetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    const body = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`)
    return withoutMarkup((JSON.parse(body) as { text?: string }).text ?? '')
}

interface StreamWord {
    text: string
    arrivedSeconds: number
}

/** Plays a recording into /v1/realtime at real speed, 80 ms at a time. */
async function streamRecording(url: string, pcm: Buffer): Promise<StreamWord[]> {
    const socket = new WebSocket(`${url.replace('http', 'ws')}/v1/realtime?intent=transcription`)
    const words: StreamWord[] = []
    let startedMs = 0
    const finished = new Promise<void>(done => {
        socket.onmessage = event => {
            const message = JSON.parse(String(event.data))
            if (message.type === 'conversation.item.input_audio_transcription.delta' && message.delta) {
                words.push({ text: message.delta, arrivedSeconds: (performance.now() - startedMs) / 1000 })
            }
            if (message.type === 'conversation.item.input_audio_transcription.completed') socket.close()
        }
        socket.onclose = () => done()
        socket.onerror = () => done()
    })
    await new Promise<void>((done, fail) => {
        socket.onopen = () => done()
        setTimeout(() => fail(new Error('realtime socket did not open')), 10_000)
    })
    socket.send(JSON.stringify({ type: 'session.update', session: { audio: { input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } } } } }))
    const blockBytes = BLOCK_SECONDS * BYTES_PER_SECOND
    startedMs = performance.now()
    for (let offset = 0, block = 0; offset < pcm.length; offset += blockBytes, block++) {
        const waitMs = startedMs + block * BLOCK_SECONDS * 1000 - performance.now()
        if (waitMs > 0) await new Promise(done => setTimeout(done, waitMs))
        socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(offset, offset + blockBytes).toString('base64') }))
    }
    socket.send(JSON.stringify({ type: 'input_audio_buffer.commit', final: true }))
    await Promise.race([finished, new Promise(done => setTimeout(done, 60_000))])
    return words
}

function assignStreamedWords(words: StreamWord[], utterances: Utterance[]): UtteranceResult[] {
    return utterances.map((utterance, index) => {
        const nextStart = utterances[index + 1]?.startSeconds ?? Infinity
        const until = Math.min(nextStart, utterance.endSeconds + STREAM_SETTLE_SECONDS)
        const from = index === 0 ? 0 : utterance.startSeconds
        const mine = words.filter(word => word.arrivedSeconds >= from && word.arrivedSeconds < until)
        const last = mine.filter(word => word.text.trim()).at(-1)
        return {
            ...utterance,
            text: mine.map(word => word.text).join('').trim(),
            latencyMs: last ? Math.max(0, (last.arrivedSeconds - utterance.endSeconds) * 1000) : null,
        }
    })
}

/** Engine processes alive right now: an engine executable, or Python running the transcription runner. */
function runningEngines(): string[] {
    return execFileSync('ps', ['-Ao', 'pid=,args='])
        .toString()
        .split('\n')
        .filter(line => {
            const [, executable = '', script = ''] = line.trim().split(/\s+/)
            const name = executable.split('/').at(-1) ?? ''
            return ENGINE_EXECUTABLES.has(name) || (/^python/.test(name) && script.endsWith('transcription_server.py'))
        })
}

async function sha256(path: string): Promise<string> {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    return hash.digest('hex')
}

async function launch(model: VoiceModel, logPath: string): Promise<{ server: RunningServer; files: string[] }> {
    const engine = model.engine
    if (engine.kind === 'crispasr') {
        const port = await freePort()
        const file = join(CRISPASR_MODELS, engine.file)
        const server = await startEngine({
            command: CRISPASR_BINARY,
            arguments: ['--server', '--port', String(port), '--backend', engine.backend, '-m', file, '--auto-download'],
            environment: { CRISPASR_CACHE_DIR: CRISPASR_MODELS },
            port,
            logPath,
            healthPath: '/health',
        })
        return { server, files: [file] }
    }
    if (engine.kind === 'python') {
        const port = await freePort()
        const local = join(RUNNERS_DIRECTORY, engine.path)
        const server = await startEngine({
            command: join(RUNNERS_DIRECTORY, engine.environment, 'bin', 'python'),
            arguments: [RUNNER_SCRIPT, '--model', engine.runner, '--path', existsSync(local) ? local : engine.path, '--port', String(port)],
            port,
            logPath,
            healthPath: '/health',
        })
        const files = existsSync(local) ? readdirSync(local).filter(name => /\.(bark|safetensors)$/.test(name)).map(name => join(local, name)) : []
        return { server, files }
    }
    const modelPath = join(LLAMA_MODELS, engine.directory, engine.model)
    const projectorPath = join(LLAMA_MODELS, engine.directory, engine.projector)
    return { server: await startServer(modelPath, projectorPath, logPath, THINKING_OFF), files: [modelPath, projectorPath] }
}

/** The model's files on disk, for estimating time left (bigger models take longer). */
function modelSizeGigabytes(model: VoiceModel): number {
    const engine = model.engine
    const paths =
        engine.kind === 'crispasr'
            ? [join(CRISPASR_MODELS, engine.file)]
            : engine.kind === 'python'
              ? [join(RUNNERS_DIRECTORY, engine.path)]
              : [join(LLAMA_MODELS, engine.directory, engine.model), join(LLAMA_MODELS, engine.directory, engine.projector)]
    const bytes = paths.reduce((sum, path) => {
        if (!existsSync(path)) return sum
        const stats = statSync(path)
        return sum + (stats.isDirectory() ? readdirSync(path).reduce((total, name) => total + statSync(join(path, name)).size, 0) : stats.size)
    }, 0)
    return bytes ? bytes / 1e9 : 2
}

function percentile(values: number[], fraction: number): number | null {
    if (values.length === 0) return null
    const sorted = [...values].sort((first, second) => first - second)
    return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)])
}

/** Steps for progress: one per utterance, or one per recording for streaming models (they hear it whole). */
function stepsFor(model: VoiceModel, recordings: Recording[]): number {
    return model.engine.kind === 'llama-realtime' ? recordings.length : recordings.reduce((sum, recording) => sum + recording.utterances.length, 0)
}

let stepsCompleted = 0

/** Thrown between utterances when a stop has been asked for; the model is left out of the results. */
class StopRequested extends Error {}

async function transcribeRecording(model: VoiceModel, server: RunningServer, recording: Recording, totalSteps: number): Promise<UtteranceResult[]> {
    if (model.engine.kind === 'llama-realtime') {
        const results = assignStreamedWords(await streamRecording(server.url, recording.pcm), recording.utterances)
        stepDone(model.id, ++stepsCompleted, totalSteps, `${recording.speaker.id}, streamed`, { note: `${results.filter(result => result.text).length} of ${results.length} lines heard` })
        return results
    }
    const results: UtteranceResult[] = []
    for (const utterance of recording.utterances) {
        if (stopRequested()) throw new StopRequested()
        const startedMs = performance.now()
        try {
            const text = await transcribe(server.url, slice(recording.pcm, utterance))
            results.push({ ...utterance, text, latencyMs: performance.now() - startedMs })
        } catch (error) {
            results.push({ ...utterance, text: '', latencyMs: null, error: error instanceof Error ? error.message : String(error) })
        }
        const last = results.at(-1)!
        stepDone(model.id, ++stepsCompleted, totalSteps, `${recording.speaker.id}, line ${results.length}`, {
            passed: last.latencyMs !== null && last.latencyMs < LATENCY_TARGET_MS,
            note: last.error ?? `${((last.latencyMs ?? 0) / 1000).toFixed(2)} s: ${last.text.slice(0, 60)}`,
        })
    }
    return results
}

function rate(counts: ErrorCounts): number {
    return Number(errorRate(counts).toFixed(4))
}

async function benchmarkModel(model: VoiceModel, recordings: Recording[]): Promise<Record<string, unknown>> {
    const others = runningEngines()
    if (others.length) throw new Error(`another engine is still running, refusing to measure: ${others.join('; ')}`)
    stepsCompleted = 0
    const totalSteps = stepsFor(model, recordings)
    startModel(model.id, totalSteps)
    const { server, files } = await launch(model, join(RAW_DIRECTORY, `${model.id}.server.log`))
    const perSpeaker: { id: string; results: UtteranceResult[] }[] = []
    try {
        if (model.engine.kind !== 'llama-realtime') await transcribe(server.url, slice(recordings[0].pcm, recordings[0].utterances[0])).catch(() => '')
        for (const recording of recordings) {
            if (stopRequested()) throw new StopRequested()
            perSpeaker.push({ id: recording.speaker.id, results: await transcribeRecording(model, server, recording, totalSteps) })
            console.log(`  ${model.id} ${recording.speaker.id} done`)
        }
    } finally {
        await server.stop()
    }
    const leftovers = runningEngines()
    if (leftovers.length) throw new Error(`engine did not exit: ${leftovers.join('; ')}`)

    const reference = referenceText()
    const scored = perSpeaker.map(speaker => ({ ...speaker, ...scoreTranscript(reference, speaker.results.map(result => result.text).join(' ')) }))
    const words = sumCounts(scored.map(speaker => speaker.words))
    const characters = sumCounts(scored.map(speaker => speaker.characters))
    const all = perSpeaker.flatMap(speaker => speaker.results)
    const latencies = all.map(result => result.latencyMs).filter((value): value is number => value !== null)
    const fileDetails = await Promise.all(files.map(async file => ({ name: file.split('/').at(-1), bytes: statSync(file).size, sha256: await sha256(file) })))
    writeFileSync(join(RAW_DIRECTORY, `${model.id}.json`), JSON.stringify({ model: model.id, speakers: perSpeaker }, null, 2))
    const detail = scored.map(speaker => ({
        speaker: speaker.id,
        wordErrorRate: rate(speaker.words),
        errors: speaker.words,
        alignment: align(reference, speaker.results.map(result => result.text).join(' ')),
        utterances: speaker.results.map(result => ({ startSeconds: result.startSeconds, endSeconds: result.endSeconds, text: result.text, latencyMs: result.latencyMs === null ? null : Math.round(result.latencyMs) })),
    }))
    writeFileSync(join(MODEL_DIRECTORY, `${model.id}.json`), `${JSON.stringify({ id: model.id, speakers: detail })}\n`)
    const latencyMedianMs = percentile(latencies, 0.5)
    const latencyP90Ms = percentile(latencies, 0.9)
    const rubric = voiceScore({ wordErrorRate: errorRate(words), latencyMedianMs, latencyP90Ms })
    finishModel(model.id, { score: rubric.score ?? '–', 'word errors': `${(errorRate(words) * 100).toFixed(1)}%`, 'typical wait': `${((latencyMedianMs ?? 0) / 1000).toFixed(2)} s` })
    return {
        id: model.id,
        ...rubric,
        name: model.name,
        maker: model.maker,
        licence: model.licence,
        engine: model.engine.kind === 'llama-realtime' ? 'llama-server (realtime)' : model.engine.kind,
        mode: model.engine.kind === 'llama-realtime' ? 'streaming' : 'whole utterance',
        source: model.engine.source,
        files: fileDetails,
        sizeGigabytes: Number((fileDetails.reduce((sum, file) => sum + file.bytes, 0) / 1e9).toFixed(2)),
        wordErrorRate: rate(words),
        characterErrorRate: rate(characters),
        errors: words,
        bySpeaker: Object.fromEntries(scored.map(speaker => [speaker.id, rate(speaker.words)])),
        latencyMedianMs,
        latencyP90Ms,
        latencyMaxMs: percentile(latencies, 1),
        /** Share of utterances whose final text arrived within LATENCY_TARGET_MS of their end. */
        withinTarget: Number((latencies.filter(value => value < LATENCY_TARGET_MS).length / all.length).toFixed(3)),
        utterancesWithoutText: all.filter(result => !result.text).length,
        failedUtterances: all.filter(result => result.error).length,
        loadSeconds: Number((server.loadMs / 1000).toFixed(1)),
        peakMemoryGigabytes: Number((server.peakFootprintBytes / 1e9).toFixed(2)),
    }
}

function command(binary: string, ...argumentsGiven: string[]): string {
    const result = spawnSync(binary, argumentsGiven)
    return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

/** Everything someone needs to reproduce the run. */
async function runDetails(recordings: Recording[]): Promise<Record<string, unknown>> {
    const pip = (environment: string, packageName: string): string =>
        command(join(RUNNERS_DIRECTORY, environment, 'bin', 'pip'), 'show', packageName).match(/Version: (\S+)/)?.[1] ?? 'not installed'
    const firstUtterances = JSON.parse(readFileSync(recordings[0].utterancesPath, 'utf8')) as { detector: string; endOfUtteranceSeconds: number }
    return {
        benchmark: 'voicebench',
        version: RESULTS_VERSION,
        date: new Date().toISOString(),
        hardware: {
            machine: command('sysctl', '-n', 'hw.model'),
            chip: command('sysctl', '-n', 'machdep.cpu.brand_string'),
            memoryGigabytes: Number(command('sysctl', '-n', 'hw.memsize')) / 2 ** 30,
            cores: Number(command('sysctl', '-n', 'hw.ncpu')),
            macOS: `${command('sw_vers', '-productVersion')} (${command('sw_vers', '-buildVersion')})`,
        },
        engines: {
            crispasr: command(CRISPASR_BINARY, '--version').match(/crispasr [^\n]+/)?.[0] ?? 'unknown',
            llamaServer: command(LLAMA_SERVER_BINARY, '--version').match(/version: [^\n]+/)?.[0] ?? 'unknown',
            python: {
                mlx: pip('venv', 'mlx'),
                'mlx-audio': pip('venv', 'mlx-audio'),
                torch: pip('venv', 'torch'),
                transformers: pip('venv', 'transformers'),
                'qwen-asr': pip('venv-musci', 'qwen-asr'),
                'transformers (Musci-ASR)': pip('venv-musci', 'transformers'),
                'silero-vad': pip('venv-musci', 'silero-vad'),
            },
            harness: `bun ${process.versions.bun}`,
        },
        input: {
            script: 'script/reading-script.md',
            scriptSha256: await sha256(scriptPath()),
            utteranceDetector: firstUtterances.detector,
            endOfUtteranceSeconds: firstUtterances.endOfUtteranceSeconds,
            speakers: await Promise.all(
                recordings.map(async recording => ({
                    ...recording.speaker,
                    audioSeconds: Number((recording.pcm.length / BYTES_PER_SECOND).toFixed(2)),
                    utterances: recording.utterances.length,
                    recordingSha256: await sha256(recording.path),
                }))
            ),
        },
        method: {
            settings: 'Each engine with its defaults, except thinking: models on llama-server run with thinking off (--reasoning off), the same as in Toolbench. The only other arguments are the model files and a port. CrispASR also gets --auto-download, so it may fetch helper files its defaults use; CrispASR and the Python runner have no thinking to turn off.',
            wholeUtteranceModels: 'Each utterance sent alone to POST /v1/audio/transcriptions as soon as it ends; latency is the request time. One utterance is sent untimed first to warm the model up.',
            streamingModels: `Each recording played into /v1/realtime at real speed in ${BLOCK_SECONDS * 1000} ms blocks; an utterance's words are those arriving before the next utterance starts (at most ${STREAM_SETTLE_SECONDS} s after it ends); latency is from its end to its last word.`,
            score: 'A 0–100 score from fixed scales, so it doesn\'t change when other models are added: accuracy (60%: 15% word errors scores 0, 2% scores 100), typical wait (25%: 1.5 s scores 0, 50 ms scores 100) and slow wait, the slowest 1 in 10 (15%: 3 s scores 0, 150 ms scores 100), each on a log scale so every halving counts the same.',
            accuracy: 'Word and character error rate against the script, pooled over every speaker. Both sides are lower-cased, punctuation removed, contractions expanded, numbers written as digits and British spellings made American. Output markup (Qwen3-ASR language tags, VibeVoice speaker labels) is removed first. Speakers\' own slips count against every model alike.',
            latencyTarget: `${LATENCY_TARGET_MS} ms from the end of an utterance to its final text.`,
            isolation: "One model at a time. The run refuses to start a model while any other engine process is alive, and confirms the model's server has exited before the next starts.",
            runs: 'One pass per model per recording.',
        },
    }
}

async function main(): Promise<void> {
    const argumentsGiven = process.argv.slice(2)
    const listed = argumentsGiven.includes('--models') ? argumentsGiven[argumentsGiven.indexOf('--models') + 1].split(',') : null
    const models = listed ? VOICE_MODELS.filter(model => listed.includes(model.id)) : VOICE_MODELS
    const recordings = loadRecordings()
    if (recordings.length === 0) throw new Error('No recordings listed in recordings/speakers.json')
    mkdirSync(RAW_DIRECTORY, { recursive: true })
    mkdirSync(MODEL_DIRECTORY, { recursive: true })
    const details = await runDetails(recordings)
    const previous = existsSync(RESULTS_PATH) ? ((JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as { models?: { id: string }[] }).models ?? []) : []
    const rows = new Map(previous.map(row => [row.id, row as Record<string, unknown>]))
    console.log(`voicebench: ${models.length} models × ${recordings.length} recordings`)
    const resume = argumentsGiven.includes('--resume')
    const scriptHash = await sha256(scriptPath())
    const previousInput = existsSync(RESULTS_PATH) ? (JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as { input?: { scriptSha256?: string; speakers?: { recordingSha256?: string }[] } }).input : undefined
    const sameInput = previousInput?.scriptSha256 === scriptHash && JSON.stringify(previousInput?.speakers?.map(speaker => speaker.recordingSha256)) === JSON.stringify((details.input as { speakers: { recordingSha256: string }[] }).speakers.map(speaker => speaker.recordingSha256))
    const done = new Map(
        resume && sameInput
            ? [...rows.values()]
                  .filter(row => !row.error && row.score !== undefined)
                  .map(row => [String(row.id), { score: Number(row.score), 'word errors': `${(Number(row.wordErrorRate) * 100).toFixed(1)}%`, 'typical wait': `${(Number(row.latencyMedianMs ?? 0) / 1000).toFixed(2)} s` }] as const)
            : []
    )
    startRun('voicebench', models.map(model => ({ id: model.id, name: model.name, sizeGigabytes: modelSizeGigabytes(model) })), new Map(done))
    process.on('SIGINT', () => {
        finishRun('stopped')
        process.exit(130)
    })
    for (const model of models.filter(candidate => !done.has(candidate.id))) {
        if (stopRequested()) break
        console.log(`voicebench: ${model.id}`)
        try {
            rows.set(model.id, await benchmarkModel(model, recordings))
        } catch (error) {
            if (error instanceof StopRequested) {
                console.log(`  ${model.id} stopped`)
                stopModel(model.id)
                break
            }
            const message = error instanceof Error ? error.message : String(error)
            console.log(`  ${model.id} failed: ${message}`)
            failModel(model.id, message)
            rows.set(model.id, { id: model.id, name: model.name, maker: model.maker, error: message })
            if (runningEngines().length) throw new Error(`stopping: an engine is still running after ${model.id} failed`)
        }
        const ordered = [...rows.values()].sort((first, second) => Number(second.score ?? -1) - Number(first.score ?? -1))
        writeFileSync(RESULTS_PATH, `${JSON.stringify({ ...details, models: ordered }, null, 2)}\n`)
    }
    finishRun(stopRequested() ? 'stopped' : 'finished')
}

await main()
