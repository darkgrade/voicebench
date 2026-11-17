// The GPU is measured by one bench at a time: Toolbench and Voicebench hold this lock (a folder, made atomically)
// while a model is loaded and measured. A lock whose process has gone is taken over.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCK = process.env.GPU_LOCK ?? '/tmp/darkgrade-bench-gpu.lock'
const alive = (pid: number) => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
}

/** Runs `measure` holding the GPU lock, waiting for it (six hours at most); `waiting` is told once a minute. */
export async function withGpu<T>(measure: () => Promise<T>, waiting?: (holder: string) => unknown): Promise<T> {
    for (let waited = 0; ; waited += 2000) {
        try {
            mkdirSync(LOCK)
            writeFileSync(join(LOCK, 'owner'), `${process.pid} ${process.argv.slice(1).join(' ')}`)
            break
        } catch {
            let owner = ''
            try {
                owner = readFileSync(join(LOCK, 'owner'), 'utf8')
            } catch {}
            const pid = Number(owner.split(' ')[0])
            if (owner && !alive(pid)) {
                rmSync(LOCK, { recursive: true, force: true })
                continue
            }
            if (waited >= 6 * 3_600_000) throw new Error(`The GPU is still taken after six hours: ${owner}`)
            if (waited % 60_000 === 0) await waiting?.(owner)
            await new Promise(resolve => setTimeout(resolve, 2000))
        }
    }
    try {
        return await measure()
    } finally {
        rmSync(LOCK, { recursive: true, force: true })
    }
}
