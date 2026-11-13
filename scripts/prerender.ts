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
    BENCH: { name: string; tagline: string; repository: string; path: string; origin: string; subject: string }
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

/**
 * The preview card, Darkgrade's look: obsidian with a gold accent. The heading and numbers sit in the
 * middle with wide margins, because chat apps crop and zoom previews from the edges in.
 */
async function card(route: Route): Promise<Buffer> {
    const text = (children: string, style: Record<string, unknown>) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } })
    const element = {
        type: 'div',
        props: {
            style: {
                width: 1200,
                height: 630,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 44,
                padding: '0 120px',
                background: 'radial-gradient(circle at 85% 0%, #2a2216 0%, #0b0b0c 60%)',
                color: '#eae6dc',
                fontFamily: 'Public Sans',
            },
            children: [
                text(`DARKGRADE  ·  ${route.card.eyebrow.toUpperCase()}`, { fontSize: 22, letterSpacing: 6, color: '#f4c66e' }),
                text(route.card.heading, { fontSize: route.card.heading.length > 44 ? 54 : 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 960 }),
                {
                    type: 'div',
                    props: {
                        style: { display: 'flex', gap: 24 },
                        children: route.card.stats.map(stat => ({
                            type: 'div',
                            props: {
                                style: { display: 'flex', flexDirection: 'column', gap: 6, padding: '18px 26px', border: '1px solid #3a3326', borderRadius: 16, background: 'rgba(244,198,110,0.06)' },
                                children: [
                                    text(stat.label.toUpperCase(), { fontSize: 18, letterSpacing: 3, color: '#9c968a' }),
                                    text(stat.value, { fontSize: 38, fontWeight: 700, color: '#f4c66e' }),
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

const DARKGRADE = { '@type': 'Organization', name: 'Darkgrade', url: 'https://darkgrade.com/' }
const home = `${server.BENCH.origin}${server.BENCH.path}`

/** Schema.org data: the bench is a Dataset by Darkgrade with its code on GitHub; each other page is part of it. */
function structuredData(route: Route, url: string): string {
    const dataset = {
        '@type': 'Dataset',
        '@id': `${home}#dataset`,
        name: `${server.BENCH.name} by Darkgrade`,
        alternateName: server.BENCH.subject,
        description: server.BENCH.tagline,
        url: home,
        creator: DARKGRADE,
        publisher: DARKGRADE,
        isAccessibleForFree: true,
        sameAs: `https://github.com/${server.BENCH.repository}`,
    }
    if (!route.path) return JSON.stringify({ '@context': 'https://schema.org', ...dataset })
    return JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: route.title, description: route.description, url, isPartOf: dataset, publisher: DARKGRADE })
}

const pages: string[] = []
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
        `<script type="application/ld+json">${structuredData(route, url).replace(/</g, '\\u003c')}</script>`,
    ].join('\n        ')
    const html = template
        .replace(/<title>[\s\S]*?<meta name="twitter:card"[^>]*>/, head)
        .replace('<div id="root"></div>', `<div id="root">${server.render(`${server.BENCH.path}${route.path}`)}</div>`)
    const file = join(output, route.path, 'index.html')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, html)
    pages.push(url)
    const cardFile = join(output, 'og', `${route.path ? route.path.replace(/\/$/, '') : 'index'}.png`)
    mkdirSync(dirname(cardFile), { recursive: true })
    writeFileSync(cardFile, await card(route))
}
writeFileSync(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${escape(page)}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log(`prerendered ${server.routes().length} pages`)
