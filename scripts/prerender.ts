/**
 * Writes one static HTML page per route (the overview and each model) with its own title,
 * description, canonical URL and preview card, and draws each card as a 1200×630 PNG with the
 * benchmark's numbers. Runs after `vite build` and the server build; static output only.
 */
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import satori from 'satori'

interface Route {
    path: string
    title: string
    description: string
    card: { eyebrow: string; heading: string; stats: { label: string; value: string }[] }
}

const root = resolve(import.meta.dirname, '..')
const server = (await import(join(root, '.server', 'server.js'))) as {
    render: (path: string) => string
    routes: () => Route[]
    BENCH: { path: string; origin: string }
}
const output = join(root, 'dist', server.BENCH.path)
const template = readFileSync(join(output, 'index.html'), 'utf8')
const fonts = createRequire(import.meta.url)
const font = (weight: number) => readFileSync(fonts.resolve(`@fontsource/public-sans/files/public-sans-latin-${weight}-normal.woff`))
const FONTS = [
    { name: 'Public Sans', data: font(400), weight: 400 as const, style: 'normal' as const },
    { name: 'Public Sans', data: font(700), weight: 700 as const, style: 'normal' as const },
]

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The preview card: the bench, the page's subject and its headline numbers, white on black. */
async function card(route: Route): Promise<Buffer> {
    const element = {
        type: 'div',
        props: {
            style: { width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#09090b', color: '#fafafa', fontFamily: 'Public Sans' },
            children: [
                { type: 'div', props: { style: { fontSize: 32, color: '#a1a1aa' }, children: route.card.eyebrow } },
                { type: 'div', props: { style: { fontSize: route.card.heading.length > 40 ? 64 : 84, fontWeight: 700, lineHeight: 1.05 }, children: route.card.heading } },
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', gap: 64 },
                        children: route.card.stats.map(stat => ({
                            type: 'div',
                            props: {
                                style: { display: 'flex', flexDirection: 'column' },
                                children: [
                                    { type: 'div', props: { style: { fontSize: 24, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 2 }, children: stat.label } },
                                    { type: 'div', props: { style: { fontSize: 48, fontWeight: 700 }, children: stat.value } },
                                ],
                            },
                        })),
                    },
                },
            ],
        },
    }
    const svg = await satori(element as Parameters<typeof satori>[0], { width: 1200, height: 630, fonts: FONTS })
    return Buffer.from(new Resvg(svg).render().asPng())
}

for (const route of server.routes()) {
    const url = `${server.BENCH.origin}${server.BENCH.path}${route.path}`
    const image = `${server.BENCH.origin}${server.BENCH.path}og/${route.path ? route.path.replace(/\/$/, '') : 'index'}.png`
    const head = [
        `<title>${escape(route.title)}</title>`,
        `<meta name="description" content="${escape(route.description)}" />`,
        `<link rel="canonical" href="${url}" />`,
        `<meta property="og:title" content="${escape(route.title)}" />`,
        `<meta property="og:description" content="${escape(route.description)}" />`,
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
    ].join('\n        ')
    const html = template
        .replace(/<title>[\s\S]*?<meta name="twitter:card"[^>]*>/, head)
        .replace('<div id="root"></div>', `<div id="root">${server.render(`${server.BENCH.path}${route.path}`)}</div>`)
    const file = join(output, route.path, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, html)
    const cardFile = join(output, 'og', `${route.path ? route.path.replace(/\/$/, '') : 'index'}.png`)
    mkdirSync(dirname(cardFile), { recursive: true })
    writeFileSync(cardFile, await card(route))
}
console.log(`prerendered ${server.routes().length} pages`)
