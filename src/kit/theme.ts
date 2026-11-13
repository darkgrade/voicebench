/**
 * The visual language every view shares: ink for the near-black background, and the type scale.
 * Fonts come only from the --font-* variables (shared rules), never named here.
 *
 * Shared by Toolbench, Voicebench and Cambench: keep the three copies in step.
 */

/** The background every visualization draws on, and the ink for text, axes and gridlines over it. */
export const INK = {
    background: 'oklch(0.141 0.005 285.823)',
    surface: 'oklch(0.18 0.006 285)',
    grid: 'oklch(1 0 0 / 0.07)',
    axis: 'oklch(1 0 0 / 0.32)',
    muted: 'oklch(0.705 0.015 286)',
    text: 'oklch(0.985 0 0)',
    /** Darkgrade's gold, for the one thing a view wants you to look at. */
    accent: 'oklch(0.85 0.12 85)',
} as const

/** Colors that read as good, off and bad on the dark background, at similar weight so none shouts by accident. */
export const TONE = {
    good: 'oklch(0.8 0.1 235)',
    fair: 'oklch(0.84 0.15 85)',
    bad: 'oklch(0.68 0.21 22)',
    worst: 'oklch(0.62 0.2 320)',
    quiet: 'oklch(0.45 0.02 285)',
} as const

/** Evenly spaced hues at one lightness, for categories with no order (makers, brands, sources). */
export function hues(count: number, lightness = 0.76, chroma = 0.14, start = 20): string[] {
    return Array.from({ length: count }, (_, index) => `oklch(${lightness} ${chroma} ${Math.round(start + (index * 360) / count) % 360})`)
}

/** Tailwind classes for the type scale, so headings and annotations match across views. */
export const TYPE = {
    display: 'font-heading text-4xl sm:text-6xl font-semibold tracking-tight leading-none',
    title: 'font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-balance',
    heading: 'font-heading text-lg font-semibold tracking-tight',
    body: 'text-sm sm:text-base text-foreground/90 leading-relaxed text-pretty',
    label: 'text-[11px] uppercase tracking-[0.14em] text-muted-foreground',
    number: 'font-mono tabular-nums',
    annotation: 'text-xs text-muted-foreground',
} as const

/** The frosted card every view floats over the picture. */
export const GLASS = 'border-white/10 bg-[oklch(0.16_0.006_285/0.82)] backdrop-blur-md'
