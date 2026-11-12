/**
 * Runs one model's server at a time: starts it, waits until it answers, samples its memory, and
 * stops it, confirming it has exited so the next model gets the whole GPU and memory.
 */
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { createServer } from 'node:net'
import { LLAMA_SERVER_BINARY } from '@bench/models'

const STARTUP_TIMEOUT_MS = 15 * 60_000
const MEMORY_SAMPLE_INTERVAL_MS = 1000

export function freePort(): Promise<number> {
    return new Promise((done, fail) => {
        const server = createServer()
        server.once('error', fail)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : 0
            server.close(() => done(port))
        })
    })
}

/** Physical footprint in bytes: on Apple Silicon this includes GPU (Metal) memory, which RSS misses. */
function footprintBytes(pid: number): number | null {
    try {
        const output = execFileSync('footprint', ['-p', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
        const match = output.match(/Footprint:\s*([\d.]+)\s*(KB|MB|GB)/)
        if (!match) return null
        return Number(match[1]) * { KB: 1e3, MB: 1e6, GB: 1e9 }[match[2] as 'KB' | 'MB' | 'GB']
    } catch {
        return null
    }
}

export class RunningServer {
    peakFootprintBytes = 0
    private sampler: ReturnType<typeof setInterval> | null = null

    constructor(
        readonly child: ChildProcess,
        readonly port: number,
        readonly loadMs: number
    ) {}

    get url(): string {
        return `http://127.0.0.1:${this.port}`
    }

    private sampleMemory(): void {
        const bytes = this.child.pid ? footprintBytes(this.child.pid) : null
        if (bytes && bytes > this.peakFootprintBytes) this.peakFootprintBytes = bytes
    }

    startSampling(): void {
        this.sampleMemory()
        this.sampler = setInterval(() => this.sampleMemory(), MEMORY_SAMPLE_INTERVAL_MS)
    }

    /** Stops the server and waits until its process is gone. */
    async stop(): Promise<void> {
        if (this.sampler) clearInterval(this.sampler)
        this.sampleMemory()
        if (this.child.exitCode !== null || this.child.signalCode !== null) return
        const exited = new Promise<void>(done => this.child.once('exit', () => done()))
        this.child.kill('SIGTERM')
        const forced = setTimeout(() => this.child.kill('SIGKILL'), 5000)
        await exited
        clearTimeout(forced)
    }
}

export interface EngineLaunch {
    command: string
    arguments: string[]
    port: number
    logPath: string
    /** Path that answers 200 once the model is loaded. */
    healthPath: string
    environment?: Record<string, string>
}

export async function startEngine(launch: EngineLaunch): Promise<RunningServer> {
    const startedMs = performance.now()
    const child = spawn(launch.command, launch.arguments, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...launch.environment } })
    const log = createWriteStream(launch.logPath)
    child.stdout?.pipe(log)
    child.stderr?.pipe(log)
    let exitDescription: string | null = null
    child.once('exit', (code, signal) => {
        exitDescription = signal ? `stopped by ${signal}` : `exited with code ${code}`
    })
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    while (Date.now() < deadline) {
        if (exitDescription) throw new Error(`${launch.command} ${exitDescription}; see ${launch.logPath}`)
        try {
            const response = await fetch(`http://127.0.0.1:${launch.port}${launch.healthPath}`)
            if (response.ok) {
                const server = new RunningServer(child, launch.port, performance.now() - startedMs)
                server.startSampling()
                return server
            }
        } catch {
            // still loading
        }
        await new Promise(done => setTimeout(done, 100))
    }
    child.kill('SIGKILL')
    throw new Error(`${launch.command} did not start within ${STARTUP_TIMEOUT_MS / 1000} s`)
}

/** Launches llama-server with only what it must be told: the model, its projector and a port. */
export async function startServer(modelPath: string, projectorPath: string | undefined, logPath: string, extraArguments: string[] = []): Promise<RunningServer> {
    const port = await freePort()
    const projector = projectorPath ? ['--mmproj', projectorPath] : []
    return startEngine({
        command: LLAMA_SERVER_BINARY,
        arguments: ['--model', modelPath, ...projector, '--host', '127.0.0.1', '--port', String(port), '--no-webui', ...extraArguments],
        port,
        logPath,
        healthPath: '/health',
    })
}
