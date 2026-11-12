/**
 * Every speech model the benchmark runs and the engine that serves it. Each engine is the model's
 * natural home on a Mac: CrispASR (one ggml/Metal engine for most speech models), llama.cpp's
 * llama-server for the GGUF speech models it supports upstream, and a small Python runner for models
 * that ship only Python code. Files are each engine's default build of the model.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Engines, models and Python environments live outside the repo (tens of GB). */
export const CACHE_DIRECTORY = process.env.BENCH_CACHE ?? join(homedir(), '.cache', 'darkgrade-bench', 'voicebench')
export const CRISPASR_RELEASE = 'v0.8.53'
export const CRISPASR_BINARY = join(CACHE_DIRECTORY, 'crispasr', 'crispasr-macos-arm64', 'crispasr')
export const CRISPASR_MODELS = join(CACHE_DIRECTORY, 'crispasr-models')
export const LLAMA_CPP_RELEASE = 'b12283'
export const LLAMA_SERVER_BINARY = join(CACHE_DIRECTORY, 'llama.cpp', 'llama-server')
export const LLAMA_MODELS = join(CACHE_DIRECTORY, 'gguf-models')
export const RUNNERS_DIRECTORY = join(CACHE_DIRECTORY, 'python')

export type VoiceEngine =
    /** CrispASR's HTTP server: `--backend` and a GGUF from its registry (`source` is the URL it fetched). */
    | { kind: 'crispasr'; backend: string; file: string; source: string }
    /** llama-server, whole utterances through /v1/audio/transcriptions. */
    | { kind: 'llama-server'; directory: string; model: string; projector: string; source: string }
    /** llama-server's realtime WebSocket, fed the recording at real speed (streaming-only models). */
    | { kind: 'llama-realtime'; directory: string; model: string; projector: string; source: string }
    /** bench/runners/transcription_server.py in a virtual environment. */
    | { kind: 'python'; runner: 'bark-plus' | 'bark-pro' | 'musci'; environment: string; path: string; source: string }

export interface VoiceModel {
    id: string
    name: string
    maker: string
    licence: string
    engine: VoiceEngine
}

const crispasr = (backend: string, repository: string, file: string): VoiceEngine => ({
    kind: 'crispasr',
    backend,
    file,
    source: `https://huggingface.co/${repository}/resolve/main/${file}`,
})

const llama = (kind: 'llama-server' | 'llama-realtime', repository: string, model: string, projector: string): VoiceEngine => ({
    kind,
    directory: repository.replace('/', '__'),
    model,
    projector,
    source: `https://huggingface.co/${repository}`,
})

export const VOICE_MODELS: VoiceModel[] = [
    { id: 'bark-3.0-pro', name: 'Underdog Bark 3.0 Pro', maker: 'Conway Research', licence: 'CC-BY-NC-4.0', engine: { kind: 'python', runner: 'bark-pro', environment: 'venv', path: 'bark/Underdog-Bark-3.0-Pro', source: 'https://huggingface.co/ConwayResearch/Underdog-Bark-3.0-Pro' } },
    { id: 'bark-3.0-plus', name: 'Underdog Bark 3.0 Plus', maker: 'Conway Research', licence: 'CC-BY-NC-4.0', engine: { kind: 'python', runner: 'bark-plus', environment: 'venv', path: 'bark/Underdog-Bark-3.0-Plus', source: 'https://huggingface.co/ConwayResearch/Underdog-Bark-3.0-Plus' } },
    { id: 'musci-asr', name: 'Musci-ASR (Qwen3-ASR fine-tune)', maker: 'Musci Research', licence: 'Apache-2.0', engine: { kind: 'python', runner: 'musci', environment: 'venv-musci', path: 'Musci-research/Musci-ASR-qwen-1019', source: 'https://huggingface.co/Musci-research/Musci-ASR-qwen-1019' } },
    { id: 'phonon-2', name: 'Phonon-2', maker: 'Fermion Research', licence: 'CC-BY-4.0 (GGUF) / Apache-2.0 (package)', engine: crispasr('phonon2', 'cstr/phonon2-GGUF', 'phonon2-q8_0.gguf') },
    { id: 'parakeet-tdt-0.6b-v3', name: 'Parakeet TDT 0.6B v3', maker: 'NVIDIA', licence: 'CC-BY-4.0', engine: crispasr('parakeet', 'cstr/parakeet-tdt-0.6b-v3-GGUF', 'parakeet-tdt-0.6b-v3-q4_k.gguf') },
    { id: 'parakeet-ultra', name: 'parakeet-ultra', maker: 'moondream', licence: 'CC-BY-4.0', engine: crispasr('parakeet', 'cstr/parakeet-ultra-GGUF', 'parakeet-ultra-q4_k.gguf') },
    { id: 'parakeet-redux', name: 'parakeet-redux (ternary encoder)', maker: 'moondream', licence: 'CC-BY-4.0', engine: crispasr('parakeet', 'cstr/parakeet-redux-GGUF', 'parakeet-redux-q4_k.gguf') },
    { id: 'nemotron-3.5-asr-streaming', name: 'Nemotron 3.5 ASR Streaming 0.6B', maker: 'NVIDIA', licence: 'OpenMDW-1.1', engine: { ...(crispasr('nemotron', 'cstr/nemotron-3.5-asr-streaming-GGUF', 'nemotron-3.5-asr-streaming-0.6b-f16.gguf') as Extract<VoiceEngine, { kind: 'crispasr' }>), source: 'https://huggingface.co/cstr/nemotron-3.5-asr-streaming-GGUF/resolve/bbd95a9ca5fa0dfca3312a122dfc45a2b578b9c2/nemotron-3.5-asr-streaming-0.6b-f16.gguf' } },
    { id: 'canary-qwen-2.5b', name: 'Canary-Qwen 2.5B', maker: 'NVIDIA', licence: 'CC-BY-4.0', engine: crispasr('canary-qwen', 'cstr/canary-qwen-2.5b-GGUF', 'canary-qwen-2.5b-q4_k.gguf') },
    { id: 'cohere-transcribe', name: 'Cohere Transcribe 03-2026', maker: 'Cohere', licence: 'Apache-2.0', engine: crispasr('cohere', 'cstr/cohere-transcribe-03-2026-GGUF', 'cohere-transcribe-q4_k.gguf') },
    { id: 'higgs-audio-v3-stt', name: 'Higgs Audio v3 STT', maker: 'Boson AI', licence: 'Apache-2.0', engine: crispasr('higgs-stt', 'cstr/higgs-audio-v3-stt-GGUF', 'higgs-stt-q4_k.gguf') },
    { id: 'vibevoice-asr-streaming-1.5b', name: 'VibeVoice-ASR-Streaming 1.5B', maker: 'Microsoft', licence: 'MIT', engine: crispasr('vibevoice-streaming', 'cstr/vibevoice-asr-streaming-1.5b-GGUF', 'vibevoice-asr-streaming-1.5b-q4_k.gguf') },
    { id: 'kyutai-stt-1b', name: 'Kyutai STT 1B', maker: 'Kyutai', licence: 'MIT', engine: crispasr('kyutai-stt', 'cstr/kyutai-stt-1b-GGUF', 'kyutai-stt-1b-q4_k.gguf') },
    { id: 'moonshine-streaming-medium', name: 'Moonshine Streaming Medium', maker: 'Useful Sensors', licence: 'MIT', engine: crispasr('moonshine-streaming', 'cstr/moonshine-streaming-medium-GGUF', 'moonshine-streaming-medium-q4_k.gguf') },
    { id: 'whisper-large-v3-turbo', name: 'Whisper large-v3 turbo', maker: 'OpenAI', licence: 'MIT', engine: crispasr('whisper', 'ggerganov/whisper.cpp', 'ggml-large-v3-turbo.bin') },
    { id: 'qwen3-asr-1.7b', name: 'Qwen3-ASR 1.7B', maker: 'Qwen', licence: 'Apache-2.0', engine: llama('llama-server', 'ggml-org/Qwen3-ASR-1.7B-GGUF', 'Qwen3-ASR-1.7B-Q8_0.gguf', 'mmproj-Qwen3-ASR-1.7B-Q8_0.gguf') },
    { id: 'qwen3-asr-0.6b', name: 'Qwen3-ASR 0.6B', maker: 'Qwen', licence: 'Apache-2.0', engine: llama('llama-server', 'ggml-org/Qwen3-ASR-0.6B-GGUF', 'Qwen3-ASR-0.6B-Q8_0.gguf', 'mmproj-Qwen3-ASR-0.6B-Q8_0.gguf') },
    { id: 'granite-speech-5.0-2b', name: 'Granite Speech 5.0 2B', maker: 'IBM', licence: 'Apache-2.0', engine: llama('llama-server', 'ibm-granite/granite-speech-5.0-2b-GGUF', 'granite-speech-5.0-2b-Q8_0.gguf', 'mmproj-model-f16.gguf') },
    { id: 'lfm2.5-audio-1.5b', name: 'LFM2.5-Audio 1.5B', maker: 'Liquid AI', licence: 'LFM Open', engine: llama('llama-server', 'LiquidAI/LFM2.5-Audio-1.5B-GGUF', 'LFM2.5-Audio-1.5B-Q8_0.gguf', 'mmproj-LFM2.5-Audio-1.5B-Q8_0.gguf') },
    { id: 'voxtral-mini-4b-realtime', name: 'Voxtral Mini 4B Realtime', maker: 'Mistral', licence: 'Apache-2.0', engine: llama('llama-realtime', 'ggml-org/Voxtral-Mini-4B-Realtime-2602-GGUF', 'Voxtral-Mini-4B-Realtime-2602-Q8_0.gguf', 'mmproj-Voxtral-Mini-4B-Realtime-2602-Q8_0.gguf') },
    { id: 'lfm3-audio-2b', name: 'LFM3-Audio 2B', maker: 'Liquid AI', licence: 'LFM Open', engine: llama('llama-realtime', 'LiquidAI/LFM3-Audio-2B-GGUF', 'LFM3-Audio-2B-Q8_0.gguf', 'mmproj-LFM3-Audio-2B-Q8_0.gguf') },
]
