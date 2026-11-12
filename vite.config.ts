import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** This bench's name: its URL path and its results file. */
const BENCH = 'voicebench'

/** Served at darkgrade.com/voicebench/ (proxied to this project's Vercel deployment), so everything lives under it. */
/**
 * Dev-only controls for the /progress page: serves results/raw/progress.json (with whether its run is still
 * alive), stops the run after its current step, and starts or resumes a run in the background.
 */
function liveProgress(): Plugin {
    const root = fileURLToPath(new URL('.', import.meta.url))
    const path = join(root, 'results', 'raw', 'progress.json')
    const alive = (pid: number | undefined): boolean => {
        if (!pid) return false
        try {
            process.kill(pid, 0)
            return true
        } catch {
            return false
        }
    }
    return {
        name: 'live-progress',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(`/${BENCH}/progress.json`, (_request, response) => {
                const progress = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
                response.setHeader('content-type', 'application/json')
                response.setHeader('cache-control', 'no-store')
                response.end(JSON.stringify(progress && { ...progress, alive: alive(progress.pid) }))
            })
            server.middlewares.use(`/${BENCH}/control/stop`, (request, response) => {
                if (request.method !== 'POST') return void (response.statusCode = 405, response.end())
                spawnSync('bun', ['bench/progress.ts', '--stop'], { cwd: root })
                response.end('stopping')
            })
            server.middlewares.use(`/${BENCH}/control/start`, (request, response) => {
                if (request.method !== 'POST') return void (response.statusCode = 405, response.end())
                const progress = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
                if (progress && alive(progress.pid)) return void (response.statusCode = 409, response.end('already running'))
                mkdirSync(join(root, 'results', 'raw'), { recursive: true })
                const log = openSync(join(root, 'results', 'raw', 'bench.log'), 'a')
                const resume = new URL(request.url ?? '', 'http://localhost').searchParams.get('resume') === '1'
                spawn('bun', ['run', 'bench', ...(resume ? ['--', '--resume'] : [])], { cwd: root, detached: true, stdio: ['ignore', log, log] }).unref()
                response.end('started')
            })
        },
    }
}

export default defineConfig({
    base: '/voicebench/',
    plugins: [react(), tailwindcss(), liveProgress()],
    build: { outDir: 'dist/voicebench', emptyOutDir: true },
    resolve: {
        // One React, even when @kevinschaich/components is linked from a local checkout.
        dedupe: ['react', 'react-dom'],
        alias: {
            '@site': fileURLToPath(new URL('./src', import.meta.url)),
            '@results': fileURLToPath(new URL('./results', import.meta.url)),
            '@bench': fileURLToPath(new URL('./bench', import.meta.url)),
        },
    },
})
