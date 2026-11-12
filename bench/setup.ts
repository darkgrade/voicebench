/**
 * Installs every engine, Python environment and model file into the cache (see models.ts), skipping
 * anything already there. Versions are pinned so a run can be reproduced.
 *
 *   bun run setup
 */
import {
    CACHE_DIRECTORY,
    CRISPASR_BINARY,
    CRISPASR_MODELS,
    CRISPASR_RELEASE,
    LLAMA_CPP_RELEASE,
    LLAMA_MODELS,
    LLAMA_SERVER_BINARY,
    RUNNERS_DIRECTORY,
    VOICE_MODELS,
} from '@bench/models'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Python packages per environment, pinned. Bark Pro needs transformers 5; qwen-asr pins 4.x, so Musci-ASR gets its own. */
const ENVIRONMENTS: Record<string, string[]> = {
    venv: ['mlx==0.32.2', 'mlx-audio==0.5.3', 'constriction==0.5.0', 'numpy==2.4.6', 'soundfile==0.14.0', 'soxr==1.1.0', 'torch==2.15.0', 'transformers==5.19.0', 'librosa==0.11.0'],
    'venv-musci': ['qwen-asr', 'soundfile==0.14.0', 'silero-vad==6.2.1'],
}

function run(command: string, ...argumentsGiven: string[]): void {
    execFileSync(command, argumentsGiven, { stdio: 'inherit' })
}

function download(url: string, destination: string): void {
    run('curl', '-L', '--fail', '-o', destination, url)
}

function installEngines(): void {
    if (!existsSync(LLAMA_SERVER_BINARY)) {
        const directory = join(CACHE_DIRECTORY, 'llama.cpp')
        mkdirSync(directory, { recursive: true })
        const archive = join(directory, 'llama.tar.gz')
        download(`https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE}/llama-${LLAMA_CPP_RELEASE}-bin-macos-arm64.tar.gz`, archive)
        run('tar', '-xzf', archive, '-C', directory, '--strip-components', '1')
    }
    if (!existsSync(CRISPASR_BINARY)) {
        const directory = join(CACHE_DIRECTORY, 'crispasr')
        mkdirSync(directory, { recursive: true })
        const archive = join(directory, 'crispasr.tar.gz')
        download(`https://github.com/CrispStrobe/CrispASR/releases/download/${CRISPASR_RELEASE}/crispasr-macos-arm64.tar.gz`, archive)
        run('tar', '-xzf', archive, '-C', directory)
    }
}

function installPython(): void {
    for (const [name, packages] of Object.entries(ENVIRONMENTS)) {
        const directory = join(RUNNERS_DIRECTORY, name)
        if (existsSync(join(directory, 'bin', 'python'))) continue
        mkdirSync(RUNNERS_DIRECTORY, { recursive: true })
        run('python3.11', '-m', 'venv', directory)
        run(join(directory, 'bin', 'pip'), 'install', '--quiet', ...packages)
    }
}

function installModels(): void {
    mkdirSync(CRISPASR_MODELS, { recursive: true })
    for (const model of VOICE_MODELS) {
        const engine = model.engine
        if (engine.kind === 'crispasr') {
            const destination = join(CRISPASR_MODELS, engine.file)
            if (!existsSync(destination)) download(engine.source, destination)
            continue
        }
        if (engine.kind === 'python') {
            // Musci-ASR loads by repository id into the Hugging Face cache on first use.
            if (!engine.path.startsWith('bark/')) continue
            const destination = join(RUNNERS_DIRECTORY, engine.path)
            if (!existsSync(destination)) run('hf', 'download', engine.source.replace('https://huggingface.co/', ''), '--local-dir', destination)
            continue
        }
        const directory = join(LLAMA_MODELS, engine.directory)
        const missing = [engine.model, engine.projector].filter(file => !existsSync(join(directory, file)))
        if (missing.length) run('hf', 'download', engine.directory.replace('__', '/'), ...missing, '--local-dir', directory)
    }
}

installEngines()
installPython()
installModels()
console.log(`voicebench: everything is in ${CACHE_DIRECTORY}`)
