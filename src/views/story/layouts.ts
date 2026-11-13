/**
 * The story's pictures. Every point is one word of the script as one model heard it from one speaker
 * (model rank × speaker × word), plus a point for each word a model added. Each layout places all of
 * them: the script as text, a row per model, a column per speaker, the mistakes by word, the waits,
 * models by memory, and the field of accuracy against speed.
 */
import { BENCH, type ModelSummary } from '@site/data'
import { type Heard, OUTCOME_COLOR_INDEX, OUTCOME_PALETTE, type Outcome, outcomeAt, shortName, speakerName, spokenAt, summary } from '@site/heard'
import type { Label, Mark, Scene, Space } from '@site/kit/story'

export const PALETTE = OUTCOME_PALETTE
const COLOR_INDEX = OUTCOME_COLOR_INDEX
const OUTCOME_OF_COLOR: Outcome[] = ['right', 'wrong', 'dropped', 'added']

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** The quickest and slowest waits the wait axis shows, in milliseconds. */
const FASTEST = 20
const SLOWEST = 5000
/** How lit a word heard right is, so the mistakes stand out. */
const RIGHT_BRIGHT = 0.62
/** How lit the words heard right are when a picture is only about the mistakes: drawn behind, and not picked. */
const DUST_BRIGHT = 0.05
/** Room left around each cluster of mistakes, in pixels. */
const CLUSTER_GAP = 4
/** The size of a label's type, in pixels, and a little room around it. */
const LABEL_HEIGHT = 15

/** A steady pseudo-random 0..1 for a point, so a layout is the same every time it is drawn. */
const scatter = (seed: number): number => {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return value - Math.floor(value)
}

const NARROW_LETTERS = new Set("iljtfrI.,'!?:; ")
const WIDE_LETTERS = new Set('mwMW')

/** About how wide a label's text is drawn, in pixels. */
function textWidth(text: string): number {
    let width = 0
    for (const letter of text) width += NARROW_LETTERS.has(letter) ? 3.5 : WIDE_LETTERS.has(letter) ? 9 : letter >= 'A' && letter <= 'Z' ? 7.4 : 6.1
    return width
}

/** Labels in order of importance, without the ones that would sit on top of a more important one. */
function declutter(labels: Label[], space: Space): Label[] {
    const kept: { left: number; right: number; top: number; label: Label }[] = []
    for (const label of labels) {
        const width = textWidth(label.text) + 8
        const centre = label.u * space.width
        const left = label.align === 'start' ? centre : label.align === 'end' ? centre - width : centre - width / 2
        const top = label.v * space.height - LABEL_HEIGHT / 2
        const collides = kept.some(other => left < other.right && left + width > other.left && Math.abs(top - other.top) < LABEL_HEIGHT)
        if (!collides) kept.push({ left, right: left + width, top, label })
    }
    return kept.map(item => item.label)
}

/** What one point is: which model, speaker and script word, how it came out, and the spoken line it fell in. */
export interface Hearing {
    model: number
    speaker: number
    /** The script word; for an added word, the script word it came before. */
    word: number
    outcome: Outcome
    /** What was written, when it wasn't the script's word. */
    heard?: string
    utterance: number
    /** Milliseconds until that line's text arrived; null when none came. */
    wait: number | null
}

export interface Layouts {
    count: number
    describe: (index: number) => Hearing
    script: (space: Space) => Scene
    byModel: (space: Space) => Scene
    bySpeaker: (space: Space) => Scene
    mistakes: (space: Space) => Scene
    waits: (space: Space) => Scene
    byMemory: (space: Space) => Scene
    field: (space: Space) => Scene
}

export function makeLayouts(heard: Heard): Layouts {
    const models: ModelSummary[] = heard.models.map(summary)
    const modelCount = models.length
    const speakerCount = heard.speakers.length
    const wordCount = heard.words.length
    const scripted = modelCount * speakerCount * wordCount
    const additions = heard.runs.flatMap((bySpeaker, model) => bySpeaker.flatMap((run, speaker) => run.added.map(([word, text, utterance]) => ({ model, speaker, word: Math.min(word, wordCount - 1), text, utterance }))))
    const count = scripted + additions.length

    const modelOf = new Uint8Array(count)
    const speakerOf = new Uint8Array(count)
    const wordOf = new Uint8Array(count)
    const waitOf = new Float32Array(count)
    const color = new Uint8Array(count)
    const pointAt = (model: number, speaker: number, word: number): number => (model * speakerCount + speaker) * wordCount + word
    const waitFor = (model: number, speaker: number, utterance: number): number => heard.runs[model][speaker].said[utterance]?.wait ?? NaN
    heard.runs.forEach((bySpeaker, model) =>
        bySpeaker.forEach((run, speaker) => {
            for (let word = 0; word < wordCount; word++) {
                const index = pointAt(model, speaker, word)
                modelOf[index] = model
                speakerOf[index] = speaker
                wordOf[index] = word
                color[index] = COLOR_INDEX[outcomeAt(run, word)]
                waitOf[index] = waitFor(model, speaker, spokenAt(run, word))
            }
        })
    )
    additions.forEach((added, position) => {
        const index = scripted + position
        modelOf[index] = added.model
        speakerOf[index] = added.speaker
        wordOf[index] = added.word
        color[index] = COLOR_INDEX.added
        waitOf[index] = waitFor(added.model, added.speaker, added.utterance)
    })
    const mistaken = (index: number): boolean => color[index] !== COLOR_INDEX.right

    /** Every word lit, the mistakes fully and the rest a little less. */
    const bright = new Float32Array(count)
    for (let index = 0; index < count; index++) bright[index] = mistaken(index) ? 1 : RIGHT_BRIGHT
    /** Mistakes drawn a little larger where points glow, so they aren't lost among the rest. */
    const emphasis = new Float32Array(count)
    for (let index = 0; index < count; index++) emphasis[index] = mistaken(index) ? 1.5 : 1

    const arrays = () => ({ x: new Float32Array(count), y: new Float32Array(count) })

    function describe(index: number): Hearing {
        const model = modelOf[index]
        const speaker = speakerOf[index]
        const run = heard.runs[model][speaker]
        const wait = Number.isNaN(waitOf[index]) ? null : waitOf[index]
        if (index >= scripted) {
            const added = additions[index - scripted]
            return { model, speaker, word: added.word, outcome: 'added', heard: added.text, utterance: added.utterance, wait }
        }
        const word = wordOf[index]
        const outcome = OUTCOME_OF_COLOR[color[index]]
        return { model, speaker, word, outcome, heard: outcome === 'wrong' ? run.heard.find(([at]) => at === word)?.[1] : undefined, utterance: spokenAt(run, word), wait }
    }

    /** The points of each script word, mistakes first, so a word's colour gathers at one end. */
    const byWord: number[][] = Array.from({ length: wordCount }, () => [])
    for (let index = 0; index < count; index++) byWord[wordOf[index]].push(index)
    const mistakesFirst = (first: number, second: number): number => Number(mistaken(second)) - Number(mistaken(first)) || color[first] - color[second] || first - second
    byWord.forEach(points => points.sort(mistakesFirst))
    const wordMistakes = byWord.map(points => points.filter(mistaken))
    const worstWords = heard.words.map((_, word) => word).sort((first, second) => wordMistakes[second].length - wordMistakes[first].length)

    /** Room on the left of row layouts for model names, as a share of the plot's width. */
    const gutter = (space: Space): number => (space.wide ? Math.min(0.3, 150 / space.width) : 0.09)
    const ROWS_TOP = 0.05
    const rowPitch = (1 - ROWS_TOP) / modelCount
    const rowCentre = (model: number): number => ROWS_TOP + (model + 0.5) * rowPitch

    function rowLabels(space: Space, accent?: (model: ModelSummary) => boolean): Label[] {
        const left = gutter(space)
        const every = space.height / modelCount >= 12 ? 1 : space.height / modelCount >= 6 ? 2 : 4
        return models.flatMap((model, index): Label[] =>
            index % every === 0 || index === modelCount - 1
                ? [
                      {
                          u: left - 0.012,
                          v: rowCentre(index),
                          text: space.wide ? shortName(model) : String(index + 1),
                          align: 'end',
                          tone: accent?.(model) ? 'accent' : 'muted',
                          href: space.wide ? `${BENCH.path}${model.id}/` : undefined,
                      },
                  ]
                : []
        )
    }

    /** The script set as text: each written word where its label goes, with room under it for its hearings. */
    function typeset(space: Space) {
        const gap = space.wide ? 9 : 6
        // On a wide plot each script line starts a new row; on a narrow one they run on, a little apart.
        const lineGap = space.wide ? 0 : 10
        const boxes: { token: number; left: number; width: number; row: number }[] = []
        let left = 0
        let row = 0
        heard.tokens.forEach((token, index) => {
            const width = textWidth(token.text)
            const startsLine = index > 0 && heard.tokens[index - 1].line !== token.line
            if (startsLine) left += lineGap
            if ((startsLine && space.wide) || left + width > space.width) {
                left = 0
                row++
            }
            boxes.push({ token: index, left, width, row })
            left += width + gap
        })
        const rowHeight = Math.min(38, space.height / (row + 1))
        return { boxes, rowHeight, top: (space.height - rowHeight * (row + 1)) / 2 }
    }

    function script(space: Space): Scene {
        const { x, y } = arrays()
        const { boxes, rowHeight, top } = typeset(space)
        const labelled = rowHeight >= 13
        const barTop = labelled ? 13.5 : rowHeight * 0.2
        const barHeight = Math.max(1.5, Math.min(11, rowHeight - barTop - 4))
        for (const box of boxes) {
            const token = heard.tokens[box.token]
            const points = Array.from({ length: token.count }, (_, offset) => byWord[token.first + offset])
                .flat()
                .sort(mistakesFirst)
            points.forEach((index, position) => {
                x[index] = (box.left + ((position + 0.5) / points.length) * box.width) / space.width
                y[index] = (top + box.row * rowHeight + barTop + scatter(index) * barHeight) / space.height
            })
        }
        const loud = new Set(worstWords.slice(0, 14).map(word => heard.words[word].token))
        const labels: Label[] = labelled
            ? boxes.map(box => ({
                  u: (box.left + box.width / 2) / space.width,
                  v: (top + box.row * rowHeight + 6) / space.height,
                  text: heard.tokens[box.token].text,
                  tone: loud.has(box.token) ? 'strong' : 'muted',
              }))
            : []
        return { x, y, color, bright, scale: emphasis, radius: Math.max(0.8, Math.min(1.5, barHeight / 5)), labels }
    }

    /** How many words tall a model's band is, so its cells are as large as the plot allows. */
    function bandFit(width: number, height: number): { deep: number; across: number; size: number } {
        const gapColumns = 1.5
        let best = { deep: 1, across: wordCount, size: 0 }
        for (let deep = 2; deep <= 24; deep++) {
            const across = Math.ceil(wordCount / deep)
            const columns = speakerCount * across + (speakerCount - 1) * gapColumns
            const size = Math.min(width / columns, (height * 0.86) / deep)
            if (size > best.size) best = { deep, across, size }
        }
        return best
    }

    function byModel(space: Space): Scene {
        const { x, y } = arrays()
        const left = gutter(space)
        const width = (1 - left) * space.width
        const fit = bandFit(width, rowPitch * space.height)
        const gapColumns = 1.5
        const columnPitch = width / (speakerCount * fit.across + (speakerCount - 1) * gapColumns)
        const blockLeft = (speaker: number): number => left * space.width + speaker * (fit.across + gapColumns) * columnPitch
        for (let index = 0; index < count; index++) {
            const word = wordOf[index]
            // An added word sits on the corner of the word it came before.
            const nudge = index >= scripted ? -0.3 : 0
            const column = Math.floor(word / fit.deep)
            const level = word % fit.deep
            x[index] = (blockLeft(speakerOf[index]) + (column + 0.5 + nudge) * columnPitch) / space.width
            y[index] = rowCentre(modelOf[index]) + ((level + 0.5 + nudge - fit.deep / 2) * fit.size) / space.height
        }
        const labels: Label[] = [
            ...rowLabels(space),
            ...heard.speakers.map((speaker, index): Label => ({ u: (blockLeft(index) + (fit.across * columnPitch) / 2) / space.width, v: 0.012, text: space.wide ? speakerName(speaker.id) : String(index + 1) })),
        ]
        return { x, y, color, bright, radius: Math.max(0.6, (Math.min(fit.size, columnPitch) / 2) * 0.9), shape: 'cell', labels }
    }

    function bySpeaker(space: Space): Scene {
        const { x, y } = arrays()
        const top = 0.055
        const bottom = 0.945
        const left = space.wide ? 0.06 : 0
        const slot = ((1 - left) * space.width) / speakerCount
        const size = Math.min(slot / (modelCount + 2.5), ((bottom - top) * space.height) / wordCount)
        const blockLeft = (speaker: number): number => left * space.width + speaker * slot + (slot - modelCount * size) / 2
        const down = (word: number): number => top + ((word + 0.5) * size) / space.height
        for (let index = 0; index < count; index++) {
            const nudge = index >= scripted ? -0.3 : 0
            x[index] = (blockLeft(speakerOf[index]) + (modelOf[index] + 0.5 + nudge) * size) / space.width
            y[index] = down(wordOf[index] + nudge)
        }
        const lineLabels: Label[] = heard.lines.flatMap((_, line): Label[] => {
            const first = heard.words.findIndex(word => word.line === line)
            const last = heard.words.findLastIndex(word => word.line === line)
            if ((last - first + 1) * size < LABEL_HEIGHT) return []
            return [{ u: left - 0.012, v: down((first + last) / 2), text: space.wide ? `Line ${line + 1}` : String(line + 1), align: 'end' }]
        })
        const labels: Label[] = [
            ...heard.speakers.map((speaker, index): Label => ({ u: (blockLeft(index) + (modelCount * size) / 2) / space.width, v: 0.015, text: space.wide ? speakerName(speaker.id) : String(index + 1), tone: 'strong' })),
            ...lineLabels,
        ]
        return { x, y, color, bright, radius: Math.max(0.6, (size / 2) * 0.9), shape: 'cell', labels }
    }

    /** One circle per script word that was ever missed, sized by how often, packed around the middle of the plot. */
    function packMistakes(space: Space): { word: number; x: number; y: number; radius: number }[] {
        const missed = worstWords.filter(word => wordMistakes[word].length > 0)
        const total = missed.reduce((sum, word) => sum + wordMistakes[word].length, 0)
        const unit = Math.sqrt((space.width * space.height * 0.3) / (Math.PI * total))
        const placed: { word: number; x: number; y: number; radius: number }[] = []
        const stretch = space.width / space.height
        for (const word of missed) {
            const radius = unit * Math.sqrt(wordMistakes[word].length) + CLUSTER_GAP
            let turn = 0
            let spot = { x: space.width / 2, y: space.height / 2 }
            const free = (): boolean => placed.every(other => Math.hypot(other.x - spot.x, other.y - spot.y) > other.radius + radius)
            while (!free()) {
                turn++
                const reach = unit * 0.9 * Math.sqrt(turn)
                spot = { x: space.width / 2 + Math.cos(turn * GOLDEN_ANGLE) * reach * Math.sqrt(stretch), y: space.height / 2 + (Math.sin(turn * GOLDEN_ANGLE) * reach) / Math.sqrt(stretch) }
            }
            placed.push({ word, x: spot.x, y: spot.y, radius })
        }
        return placed
    }

    /** What a missed word's cluster is called: the word, and what most often happened to it. */
    function mistakeLabel(word: number): string {
        const instead = new Map<string, number>()
        let dropped = 0
        for (const index of wordMistakes[word]) {
            const hearing = describe(index)
            if (hearing.outcome === 'dropped') dropped++
            if (hearing.outcome === 'wrong' && hearing.heard) instead.set(hearing.heard, (instead.get(hearing.heard) ?? 0) + 1)
        }
        const [often] = [...instead.entries()].sort((first, second) => second[1] - first[1])
        const text = heard.words[word].text.toLowerCase()
        return often && often[1] > dropped ? `${text} → ${often[0]}` : `${text} · dropped`
    }

    function mistakes(space: Space): Scene {
        const { x, y } = arrays()
        const dim = new Float32Array(count)
        const scale = new Float32Array(count)
        // The words heard right fall back as dust, thickest in the middle.
        for (let index = 0; index < count; index++) {
            const reach = Math.pow(scatter(index), 0.62) * 0.56
            const angle = scatter(index + 0.37) * Math.PI * 2
            x[index] = 0.5 + Math.cos(angle) * reach
            y[index] = 0.5 + Math.sin(angle) * reach
            dim[index] = DUST_BRIGHT
            scale[index] = 0.32
        }
        const circles = packMistakes(space)
        const unit = circles.length ? (circles[0].radius - CLUSTER_GAP) / Math.sqrt(wordMistakes[circles[0].word].length) : 1
        for (const circle of circles) {
            const points = wordMistakes[circle.word]
            points.forEach((index, position) => {
                const reach = Math.sqrt((position + 0.5) / points.length) * (circle.radius - CLUSTER_GAP)
                x[index] = (circle.x + Math.cos(position * GOLDEN_ANGLE) * reach) / space.width
                y[index] = (circle.y + Math.sin(position * GOLDEN_ANGLE) * reach) / space.height
                dim[index] = 1
                scale[index] = 1
            })
        }
        const named = circles.slice(0, space.wide ? 16 : 7).map((circle): Label => ({ u: circle.x / space.width, v: (circle.y - circle.radius - 6) / space.height, text: mistakeLabel(circle.word), tone: 'strong' }))
        return { x, y, color, bright: dim, scale, radius: Math.max(1.2, unit * 0.6), labels: declutter(named, space) }
    }

    /** Where a wait falls between the quickest and slowest shown, on a log scale, 0..1. */
    const waitPosition = (milliseconds: number): number => {
        const clamped = Math.min(SLOWEST, Math.max(FASTEST, milliseconds))
        return Math.log(clamped / FASTEST) / Math.log(SLOWEST / FASTEST)
    }

    function waits(space: Space): Scene {
        const { x, y } = arrays()
        const left = gutter(space)
        // Lines that never got any text sit in their own column past the slowest wait.
        const silentColumn = 0.985
        const across = (milliseconds: number): number => left + waitPosition(milliseconds) * (0.94 - left)
        for (let index = 0; index < count; index++) {
            const wait = waitOf[index]
            x[index] = (Number.isNaN(wait) ? silentColumn : across(wait)) + (scatter(index) - 0.5) * 0.012
            y[index] = rowCentre(modelOf[index]) + (scatter(index + 0.61) - 0.5) * rowPitch * 0.72
        }
        const ticks = [
            { at: 50, text: space.wide ? '0.05 s' : '' },
            { at: 100, text: '0.1 s' },
            { at: 250, text: space.wide ? '0.25 s' : '' },
            { at: 500, text: '0.5 s' },
            { at: 1000, text: space.wide ? '1 s, the target' : '1 s' },
            { at: 2500, text: space.wide ? '2.5 s' : '' },
        ]
        const streaming = models.flatMap((model, index) => (model.mode === 'streaming' ? [index] : []))
        return {
            x,
            y,
            color,
            bright,
            scale: emphasis,
            radius: Math.max(1, Math.min(2.2, rowPitch * space.height * 0.11)),
            labels: [
                ...rowLabels(space, model => model.mode === 'streaming'),
                ...ticks.filter(tick => tick.text).map((tick): Label => ({ u: across(tick.at), v: 0.012, text: tick.text, tone: tick.at === 1000 ? 'accent' : 'muted' })),
                { u: 1, v: 0.012, text: space.wide ? 'No text' : 'none', align: 'end' },
            ],
            marks: [
                ...streaming.map((model): Mark => ({ u0: left - 0.005, v0: rowCentre(model) - rowPitch / 2, u1: 1, v1: rowCentre(model) + rowPitch / 2, tone: 'band' })),
                ...ticks.map((tick): Mark => ({ u0: across(tick.at), v0: 0.03, u1: across(tick.at), v1: 1.005, tone: tick.at === 1000 ? 'accent' : 'line' })),
            ],
        }
    }

    function byMemory(space: Space): Scene {
        const { x, y } = arrays()
        const order = models.map((_, index) => index).sort((first, second) => (models[first].peakMemoryGigabytes ?? 0) - (models[second].peakMemoryGigabytes ?? 0))
        const columnOf = new Uint8Array(modelCount)
        order.forEach((model, column) => (columnOf[model] = column))
        const top = 0.07
        const bottom = 0.93
        const slot = space.width / modelCount
        const perModel = speakerCount * wordCount
        // Each model's words stack in a column a few cells wide, square cells, filling the plot's height.
        const wide = Math.max(1, Math.round(Math.sqrt((perModel * slot * 0.78) / ((bottom - top) * space.height))))
        const size = Math.min((slot * 0.78) / wide, ((bottom - top) * space.height) / Math.ceil(perModel / wide))
        const stacks: number[][] = Array.from({ length: modelCount }, () => [])
        for (let index = 0; index < count; index++) stacks[modelOf[index]].push(index)
        stacks.forEach((stack, model) => {
            // Heard right at the bottom, then dropped, wrong and added on top.
            stack.sort((first, second) => Number(mistaken(first)) - Number(mistaken(second)) || color[second] - color[first] || first - second)
            const centre = (columnOf[model] + 0.5) * slot
            stack.forEach((index, position) => {
                x[index] = (centre + ((position % wide) + 0.5 - wide / 2) * size) / space.width
                y[index] = bottom - ((Math.floor(position / wide) + 0.5) * size) / space.height
            })
        })
        const every = slot >= 34 ? 1 : slot >= 17 ? 2 : 4
        const gigabytes = (model: number): string => (models[model].peakMemoryGigabytes ?? 0).toFixed((models[model].peakMemoryGigabytes ?? 0) < 10 ? 1 : 0)
        const labels: Label[] = order.flatMap((model, column): Label[] => (column % every === 0 ? [{ u: (column + 0.5) / modelCount, v: bottom + 12 / space.height, text: column === 0 ? `${gigabytes(model)} GB` : gigabytes(model) }] : []))
        labels.push({ u: 0, v: 0.02, text: 'Least memory used', align: 'start' }, { u: 1, v: 0.02, text: 'Most', align: 'end' })
        return { x, y, color, bright, radius: Math.max(0.6, (size / 2) * 0.92), shape: 'cell', labels }
    }

    function field(space: Space): Scene {
        const { x, y } = arrays()
        const left = space.wide ? 0.07 : 0.1
        const rates = models.map(model => model.wordErrorRate ?? 1)
        const fewest = Math.min(...rates) * 0.7
        const most = Math.max(...rates) * 1.25
        const quickest = Math.min(...models.map(model => model.latencyMedianMs ?? SLOWEST)) * 0.7
        const slowest = Math.max(...models.map(model => model.latencyMedianMs ?? SLOWEST)) * 1.3
        const across = (milliseconds: number): number => left + (Math.log(milliseconds / quickest) / Math.log(slowest / quickest)) * (0.97 - left)
        const down = (rate: number): number => 0.05 + (Math.log(rate / fewest) / Math.log(most / fewest)) * 0.87
        const blob = Math.min(space.width, space.height) * (space.wide ? 0.03 : 0.036)
        const clusters: number[][] = Array.from({ length: modelCount }, () => [])
        for (let index = 0; index < count; index++) clusters[modelOf[index]].push(index)
        clusters.forEach((cluster, model) => {
            // Mistakes gather at the heart of each model's light.
            cluster.sort(mistakesFirst)
            const centreX = across(models[model].latencyMedianMs ?? slowest) * space.width
            const centreY = down(rates[model]) * space.height
            cluster.forEach((index, position) => {
                const reach = Math.sqrt((position + 0.5) / cluster.length) * blob
                x[index] = (centreX + Math.cos(position * GOLDEN_ANGLE) * reach) / space.width
                y[index] = (centreY + Math.sin(position * GOLDEN_ANGLE) * reach) / space.height
            })
        })
        // The best few and the ones furthest from them are named; the rest only where there is room.
        const order = [...models.keys()].sort((first, second) => Number(second >= modelCount - 2) - Number(first >= modelCount - 2) || first - second)
        const names = order.map((model): Label => ({
            u: across(models[model].latencyMedianMs ?? slowest),
            v: down(rates[model]) - (blob + 9) / space.height,
            text: shortName(models[model]),
            tone: 'strong',
            href: `${BENCH.path}${models[model].id}/`,
        }))
        const rateTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4].filter(rate => rate > fewest && rate < most)
        const waitTicks = [50, 100, 250, 500, 1000].filter(wait => wait > quickest && wait < slowest)
        const labels: Label[] = [
            ...rateTicks.map((rate): Label => ({ u: left - 0.015, v: down(rate), text: `${Math.round(rate * 100)}%`, align: 'end' })),
            { u: left - 0.015, v: 0.012, text: space.wide ? 'Word errors' : 'Errors', align: space.wide ? 'end' : 'start' },
            ...waitTicks.map((wait): Label => ({ u: across(wait), v: 0.985, text: `${wait / 1000} s`, tone: wait === 1000 ? 'accent' : 'muted' })),
            ...(space.wide ? [{ u: left, v: 0.985, text: 'Typical wait →', align: 'start' } satisfies Label] : []),
            ...declutter(names, space).slice(0, space.wide ? 12 : 5),
        ]
        const marks: Mark[] = [
            ...rateTicks.map((rate): Mark => ({ u0: left, v0: down(rate), u1: 0.985, v1: down(rate), tone: 'line' })),
            ...waitTicks.filter(wait => wait === 1000).map((wait): Mark => ({ u0: across(wait), v0: 0.03, u1: across(wait), v1: 0.95, tone: 'accent' })),
        ]
        return { x, y, color, bright, scale: emphasis, radius: Math.max(0.9, blob / 26), labels, marks }
    }

    return { count, describe, script, byModel, bySpeaker, mistakes, waits, byMemory, field }
}
