import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
    base: '/voicebench/',
    plugins: [react(), tailwindcss()],
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
