/**
 * Writes one static HTML page per route (the overview and each model) with its own title,
 * description, canonical URL and preview card, and draws each card as a 1200×630 PNG with the
 * benchmark's numbers. Runs after `vite build` and the server build; static output only.
 */
import { OgCard, backdropDataURI, darkgradeMark } from '@kevinschaich/components/og'
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import satori from 'satori'

interface Route {
    path: string
    title: string
    description: string
    card: { heading: string; sub: string }
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
    { name: 'body', data: font(400), weight: 400 as const, style: 'normal' as const },
    { name: 'heading', data: font(600), weight: 600 as const, style: 'normal' as const },
    { name: 'heading', data: font(500), weight: 500 as const, style: 'normal' as const },
    {
        name: 'mono',
        data: readFileSync(fonts.resolve('@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff')),
        weight: 400 as const,
        style: 'normal' as const,
    },
]

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The preview card: the shared Darkgrade card from @kevinschaich/components, drawn at 1200×630. */
async function card(route: Route): Promise<Buffer> {
    const address = `darkgrade.com${server.BENCH.path}${route.path}`.replace(/\/$/, '')
    const element = OgCard({
        logo: { mark: darkgradeMark.dark, name: 'Darkgrade' },
        main: route.card.heading,
        sub: route.card.sub,
        address,
        background: await backdropDataURI(),
    })
    // satori paints absolutely positioned boxes after in-flow ones, which would bury the words under the
    // backdrop; positioning the content blocks too makes everything stack in document order.
    const tree = element as unknown as { props: { children: ({ props: { style: Record<string, unknown> } } | null | false)[] } }
    for (const child of tree.props.children) if (child && !child.props.style.position) child.props.style.position = 'relative'
    const svg = await satori(element, { width: 1200, height: 630, fonts: FONTS })
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
