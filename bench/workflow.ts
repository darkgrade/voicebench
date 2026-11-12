/**
 * Voicebench as a workflow (Outpost's workflows). One run:
 *
 *   voicebench ─┬─ prepare               the recordings, and everything needed to reproduce the run
 *               ├─ model × N ──┬─ recording × M   one speaker's lines through the loaded model
 *               │              (rows scored as each model finishes)
 *               └─ publish               results/voicebench.json and results/models/*.json, to GitHub
 *
 * Models run one at a time (a concurrency limit of one on the GPU), and the harness refuses to start one
 * while any engine is alive. A recording's transcript is kept under the model's files, the recording's
 * content and the settings, so a later run reuses it and loads only models with something new to do;
 * "Run without cache" (force) redoes everything.
 */
import { MODEL_DIRECTORY, type EngineStats, RAW_DIRECTORY, RESULTS_PATH, type SpeakerResults, type UtteranceResult, assignStreamedWords, engineStats, launch, modelRow, runDetails, runningEngines, slice, streamRecording, transcribe } from '@bench/run'
import { CRISPASR_MODELS, LLAMA_MODELS, RUNNERS_DIRECTORY, VOICE_MODELS, type VoiceModel } from '@bench/models'
import { type Recording, ROOT, loadRecordings } from '@bench/recordings'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { type JsonObject, cache, fileHash, workflows } from 'outpost-workflows'

/** Settings that change what a model hears; part of every transcript's key. */
const SETTINGS = 'slice:vad-0.5s|reasoning:off|v1'
const REPOSITORY = 'darkgrade/voicebench'
const kept = cache(join(RAW_DIRECTORY, 'cache'))

type Row = JsonObject
type RunInput = { models?: string[]; speakers?: string[]; force?: boolean }
type PrepareOutput = { details: JsonObject; speakers: string[]; summary: string }
type RecordingInput = { model: string; speaker: string; url: string | null; force?: boolean }
type RecordingOutput = { results: UtteranceResult[]; summary: string }
type ModelInput = { model: string; speakers: string[]; force?: boolean }
type ModelOutput = { row: Row; detail: JsonObject; summary: string }
type PublishInput = { details: JsonObject; rows: Row[]; modelDetails: JsonObject[] }
type PublishOutput = { commit: string | null; summary: string }

const modelById = (id: string): VoiceModel => {
    const model = VOICE_MODELS.find(candidate => candidate.id === id)
    if (!model) throw new Error(`unknown model ${id}`)
    return model
}

/** The model's own files (outside the repo, gigabytes): identified by size and date rather than hashed every run. */
function modelStamp(model: VoiceModel): string {
    const engine = model.engine
    const files = engine.kind === 'crispasr' ? [join(CRISPASR_MODELS, engine.file)] : engine.kind === 'python' ? [join(RUNNERS_DIRECTORY, engine.path)] : [join(LLAMA_MODELS, engine.directory, engine.model), join(LLAMA_MODELS, engine.directory, engine.projector)]
    return files.map(file => (existsSync(file) ? `${file}:${statSync(file).size}:${statSync(file).mtimeMs}` : `${file}:missing`)).join('|')
}

let recordingsLoaded: Recording[] | null = null
const recordings = (): Recording[] => (recordingsLoaded ??= loadRecordings())
const recordingFor = (speaker: string): Recording => {
    const recording = recordings().find(candidate => candidate.speaker.id === speaker)
    if (!recording) throw new Error(`no recording for ${speaker}`)
    return recording
}
const transcriptKey = (model: VoiceModel, recording: Recording) => ['transcript', model.id, modelStamp(model), fileHash(recording.path), fileHash(recording.utterancesPath), SETTINGS].join('|')
const engineKey = (model: VoiceModel) => ['engine', model.id, modelStamp(model)].join('|')

/**
 * The same check the pre-commit hook runs (bench/anonymity.ts), on the results about to be published: they
 * reach GitHub through Outpost, not through git here, so no hook would see them. Staged in an index of
 * their own, so this checkout's own index is untouched. Throws with the check's findings.
 */
function checkAnonymity(paths: string[]): void {
    const index = join(RAW_DIRECTORY, 'publish.index')
    const env = { ...process.env, GIT_INDEX_FILE: index }
    rmSync(index, { force: true })
    const git = (...argumentsGiven: string[]) => spawnSync('git', argumentsGiven, { cwd: ROOT, env, encoding: 'utf8' })
    git('read-tree', 'HEAD')
    git('add', '--', ...paths)
    const checked = spawnSync('bun', [join(ROOT, 'bench', 'anonymity.ts'), '--staged'], { cwd: ROOT, env, encoding: 'utf8' })
    rmSync(index, { force: true })
    if (checked.status !== 0) throw new Error(`Not published: the anonymity check failed.\n${checked.stderr || checked.stdout}`)
}

export async function voicebench() {
    const { task, serve, start } = await workflows('voicebench')

    const prepare = task<{ speakers: string[] }, PrepareOutput>({
        name: 'prepare',
        fn: async input => {
            const found = input.speakers.map(recordingFor)
            const details = (await runDetails(found)) as JsonObject
            const lines = found.reduce((sum, recording) => sum + recording.utterances.length, 0)
            return { details, speakers: found.map(recording => recording.speaker.id), summary: `${found.length} recordings, ${lines} lines` }
        },
    })

    const recordingTask = task<RecordingInput, RecordingOutput>({
        name: 'recording',
        timeout: '1h',
        fn: async (input, context) => {
            const model = modelById(input.model)
            const recording = recordingFor(input.speaker)
            const key = transcriptKey(model, recording)
            const hit = input.force ? undefined : kept.get<UtteranceResult[]>(key)
            if (hit) return { results: hit, summary: 'Reused from an earlier run' }
            if (!input.url) throw new Error('No engine is running for a transcript that is not kept')
            if (model.engine.kind === 'llama-realtime') {
                const results = kept.save(key, assignStreamedWords(await streamRecording(input.url, recording.pcm), recording.utterances))
                return { results, summary: `${results.filter(result => result.text).length} of ${results.length} lines heard` }
            }
            const results: UtteranceResult[] = []
            for (const utterance of recording.utterances) {
                if (context.signal.aborted) throw new Error('Cancelled')
                const startedMs = performance.now()
                try {
                    const text = await transcribe(input.url, slice(recording.pcm, utterance))
                    results.push({ ...utterance, text, latencyMs: performance.now() - startedMs })
                } catch (error) {
                    results.push({ ...utterance, text: '', latencyMs: null, error: error instanceof Error ? error.message : String(error) })
                }
                const last = results.at(-1)!
                await context.log({ line: results.length, lines: recording.utterances.length, note: last.error ?? `${((last.latencyMs ?? 0) / 1000).toFixed(2)} s: ${last.text.slice(0, 60)}` })
            }
            return { results: kept.save(key, results), summary: `${results.length} lines transcribed` }
        },
    })

    const modelTask = task<ModelInput, ModelOutput>({
        name: 'model',
        concurrency: { key: 'gpu', max: 1 },
        timeout: '4h',
        fn: async (input, context) => {
            const model = modelById(input.model)
            const missing = input.force || input.speakers.some(speaker => !kept.get(transcriptKey(model, recordingFor(speaker))))
            let stats = input.force ? undefined : kept.get<EngineStats>(engineKey(model))
            let server: Awaited<ReturnType<typeof launch>>['server'] | null = null
            if (missing || !stats) {
                const others = runningEngines()
                if (others.length) throw new Error(`Another engine is still running, refusing to measure: ${others.join('; ')}`)
                await context.log('Loading the model')
                mkdirSync(RAW_DIRECTORY, { recursive: true })
                const launched = await launch(model, join(RAW_DIRECTORY, `${model.id}.server.log`))
                server = launched.server
                stats = kept.save(engineKey(model), await engineStats(server, launched.files))
                const first = recordingFor(input.speakers[0])
                if (model.engine.kind !== 'llama-realtime') await transcribe(server.url, slice(first.pcm, first.utterances[0])).catch(() => '')
            }
            const perSpeaker: SpeakerResults[] = []
            try {
                for (const speaker of input.speakers) {
                    const { results } = await recordingTask.run({ model: model.id, speaker, url: server?.url ?? null, force: input.force }, { label: speaker, key: `recording:${model.id}:${speaker}` })
                    perSpeaker.push({ speaker, results })
                }
            } finally {
                await server?.stop()
            }
            const leftovers = runningEngines()
            if (leftovers.length) throw new Error(`The engine did not exit: ${leftovers.join('; ')}`)
            const { row, detail } = modelRow(model, perSpeaker, stats!)
            writeFileSync(join(RAW_DIRECTORY, `${model.id}.json`), JSON.stringify({ model: model.id, speakers: perSpeaker }, null, 2))
            return { row: row as JsonObject, detail: detail as JsonObject, summary: `Score ${row.score ?? '–'} · ${(Number(row.wordErrorRate) * 100).toFixed(1)}% word errors` }
        },
    })

    const publishTask = task<PublishInput, PublishOutput>({
        name: 'publish',
        fn: async (input, context) => {
            // Rows of models not in this run stay as they were.
            const previous = existsSync(RESULTS_PATH) ? ((JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as { models?: Row[] }).models ?? []) : []
            const rows = new Map(previous.map(row => [String(row.id), row]))
            for (const row of input.rows) rows.set(String(row.id), row)
            const ordered = [...rows.values()].sort((first, second) => Number(second.score ?? -1) - Number(first.score ?? -1))
            const files: Record<string, string> = { [relative(ROOT, RESULTS_PATH)]: `${JSON.stringify({ ...input.details, models: ordered }, null, 2)}\n` }
            for (const detail of input.modelDetails) files[relative(ROOT, join(MODEL_DIRECTORY, `${detail.id}.json`))] = `${JSON.stringify(detail)}\n`
            for (const [path, text] of Object.entries(files)) writeFileSync(join(ROOT, path), text)
            checkAnonymity(Object.keys(files))
            if (!context.inOutpost) return { commit: null, summary: 'Written here (not in Outpost, so not published)' }
            const { commit } = await context.publish({ repo: REPOSITORY, files, message: 'Update results' })
            return { commit, summary: commit ? `Published ${commit.slice(0, 7)}` : 'Nothing changed' }
        },
    })

    const run = task<RunInput, { ranked: number; summary: string }>({
        name: 'voicebench',
        timeout: '24h',
        fn: async (input, context) => {
            const speakers = input.speakers ?? recordings().map(recording => recording.speaker.id)
            const models = input.models ?? VOICE_MODELS.map(model => model.id)
            await context.plan([
                { key: 'prepare', label: 'Prepare recordings', kind: 'prepare' },
                ...models.flatMap(id => [
                    { key: `model:${id}`, label: modelById(id).name, kind: 'model' },
                    ...speakers.map(speaker => ({ key: `recording:${id}:${speaker}`, label: speaker, kind: 'recording', parent: `model:${id}` })),
                ]),
                { key: 'publish', label: 'Publish', kind: 'publish' },
            ])
            const prepared = await prepare.run({ speakers }, { label: 'Prepare recordings', key: 'prepare' })
            const rows: Row[] = []
            const details: JsonObject[] = []
            for (const id of models) {
                const model = modelById(id)
                try {
                    const result = await modelTask.run({ model: id, speakers: prepared.speakers, force: input.force }, { label: model.name, key: `model:${id}` })
                    rows.push(result.row)
                    details.push(result.detail)
                } catch (error) {
                    rows.push({ id, name: model.name, maker: model.maker, error: error instanceof Error ? error.message : String(error) })
                }
            }
            const published = await publishTask.run({ details: prepared.details, rows, modelDetails: details }, { label: 'Publish', key: 'publish' })
            const scored = rows.filter(row => !row.error).length
            return { ranked: scored, summary: `${scored} of ${rows.length} models scored · ${published.summary}` }
        },
    })

    return { serve, start, run }
}
