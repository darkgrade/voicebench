/** Fits names beside points without letting them overlap: each takes the first free side, or is left out. */

export interface Named {
    /** The point the name belongs to, in pixels. */
    x: number
    y: number
    /** How far from the point the name starts. */
    clearance: number
    text: string
}

export interface Fitted<T extends Named> {
    item: T
    x: number
    y: number
    anchor: 'start' | 'end' | 'middle'
}

const CHARACTER_WIDTH = 6.1
const LINE_HEIGHT = 14

interface Box {
    left: number
    right: number
    top: number
    bottom: number
}

const overlaps = (first: Box, second: Box): boolean => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom

/** Places names in the order given (most important first) inside a width × height area. */
export function fitLabels<T extends Named>(items: T[], width: number, height: number): Fitted<T>[] {
    const taken: Box[] = []
    const fitted: Fitted<T>[] = []
    for (const item of items) {
        const length = item.text.length * CHARACTER_WIDTH
        const sides: { x: number; y: number; anchor: Fitted<T>['anchor']; left: number }[] = [
            { x: item.x + item.clearance, y: item.y, anchor: 'start', left: item.x + item.clearance },
            { x: item.x - item.clearance, y: item.y, anchor: 'end', left: item.x - item.clearance - length },
            { x: item.x, y: item.y - item.clearance - LINE_HEIGHT / 2, anchor: 'middle', left: item.x - length / 2 },
            { x: item.x, y: item.y + item.clearance + LINE_HEIGHT / 2, anchor: 'middle', left: item.x - length / 2 },
        ]
        for (const side of sides) {
            const box: Box = { left: side.left - 3, right: side.left + length + 3, top: side.y - LINE_HEIGHT / 2, bottom: side.y + LINE_HEIGHT / 2 }
            if (box.left < 0 || box.right > width || box.top < 0 || box.bottom > height || taken.some(other => overlaps(box, other))) continue
            taken.push(box)
            fitted.push({ item, x: side.x, y: side.y, anchor: side.anchor })
            break
        }
    }
    return fitted
}
