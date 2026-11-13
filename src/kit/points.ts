/**
 * A field of glowing points that morphs between layouts. Drawn with WebGL so tens of thousands stay
 * smooth: the GPU moves every point from its old place, color, size and brightness to its new one,
 * and the loop only runs while something is moving.
 *
 * Shared by Toolbench, Voicebench and Cambench: keep the three copies in step.
 */

/** Where the points are drawn inside the canvas, in CSS pixels. */
export interface Plot {
    x: number
    y: number
    width: number
    height: number
}

/** One arrangement of every point. */
export interface Frame {
    /** Positions inside the plot, 0..1 from its top left. */
    x: Float32Array
    y: Float32Array
    /** Index into the palette, per point. */
    color: Uint8Array
    /** Brightness 0..1 per point; points under 0.5 are drawn behind the rest. All lit when left out. */
    bright?: Float32Array
    /** Radius multiplier per point. All 1 when left out. */
    scale?: Float32Array
    /** Radius in CSS pixels. */
    radius: number
    /** 'dot' glows; 'cell' is a flat square, for grids. */
    shape?: 'dot' | 'cell'
}

const MOVE_MILLISECONDS = 1300
const SWEEP_MILLISECONDS = 420
/** How much wider than its core a glowing dot's sprite is, to hold the halo. */
const HALO = 3.2

const VERTEX = `
attribute vec4 aFrom;
attribute vec4 aTo;
attribute vec4 aFromColor;
attribute vec4 aToColor;
attribute float aDelay;
uniform float uTime;
uniform float uDuration;
uniform vec4 uPlot;
uniform vec2 uView;
uniform float uDpr;
uniform float uShape;
uniform float uPass;
varying vec3 vColor;
varying float vBright;
varying float vShape;
float ease(float k) { return k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0; }
void main() {
    float k = ease(clamp((uTime - aDelay) / uDuration, 0.0, 1.0));
    vec4 point = mix(aFrom, aTo, k);
    vColor = mix(aFromColor.rgb, aToColor.rgb, smoothstep(0.3, 0.7, k));
    vBright = point.w;
    vShape = uShape;
    vec2 pixel = uPlot.xy + point.xy * uPlot.zw;
    vec2 clip = vec2(pixel.x / uView.x * 2.0 - 1.0, 1.0 - pixel.y / uView.y * 2.0);
    bool lit = aTo.w > 0.5;
    if ((uPass < 0.5) == lit) clip = vec2(4.0, 4.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = max(1.0, point.z * 2.0 * uDpr * mix(${HALO.toFixed(1)}, 1.0, uShape));
}`

const FRAGMENT = `
precision mediump float;
varying vec3 vColor;
varying float vBright;
varying float vShape;
void main() {
    vec2 centred = gl_PointCoord * 2.0 - 1.0;
    float distance = length(centred) * ${HALO.toFixed(1)};
    float core = 1.0 - smoothstep(0.8, 1.15, distance);
    float halo = 0.22 * pow(max(0.0, 1.0 - distance / ${HALO.toFixed(1)}), 2.0);
    float dot = max(core, halo);
    vec2 edge = abs(centred);
    float cell = 1.0 - smoothstep(0.78, 0.94, max(edge.x, edge.y));
    float alpha = mix(dot, cell, vShape) * (0.1 + 0.9 * vBright);
    gl_FragColor = vec4(vColor * alpha, alpha);
}`

const easeInOut = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

/** CSS colors (oklch included) as RGB bytes, resolved by the browser. */
export function resolveColors(colors: string[]): Uint8Array {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const bytes = new Uint8Array(colors.length * 3)
    colors.forEach((color, index) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        bytes.set(context.getImageData(0, 0, 1, 1).data.subarray(0, 3), index * 3)
    })
    return bytes
}

export class Points {
    readonly count: number
    plot: Plot = { x: 0, y: 0, width: 1, height: 1 }
    /** False when the browser has no WebGL: nothing is drawn, and the page around it still reads. */
    readonly working: boolean
    private gl: WebGLRenderingContext | null
    private program: WebGLProgram | null = null
    private uniforms: Record<string, WebGLUniformLocation | null> = {}
    private geometry: WebGLBuffer | null = null
    private colors: WebGLBuffer | null = null
    /** Per point: from (x, y, radius, bright), to (x, y, radius, bright), delay. */
    private points: Float32Array
    /** Per point: from RGBA, to RGBA. */
    private tints: Uint8Array
    private palette: Uint8Array
    private start = -Infinity
    private longest = 0
    private shapeFrom = 0
    private shapeTo = 0
    private animation = 0
    private width = 1
    private height = 1
    private dpr = 1
    private placed = false

    constructor(
        private canvas: HTMLCanvasElement,
        count: number,
        palette: string[]
    ) {
        this.count = count
        this.points = new Float32Array(count * 9)
        this.tints = new Uint8Array(count * 8)
        this.palette = resolveColors(palette)
        // Points start as a faint knot in the middle and bloom into the first layout.
        for (let index = 0; index < count; index++) {
            const angle = Math.random() * Math.PI * 2
            const reach = Math.sqrt(Math.random()) * 0.04
            const offset = index * 9
            this.points[offset + 4] = 0.5 + Math.cos(angle) * reach
            this.points[offset + 5] = 0.5 + Math.sin(angle) * reach
            this.points[offset + 6] = 1
            this.points[offset + 7] = 0
        }
        this.gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true })
        this.working = this.gl !== null && this.compile()
    }

    private compile(): boolean {
        const gl = this.gl!
        const shader = (kind: number, source: string): WebGLShader | null => {
            const made = gl.createShader(kind)
            if (!made) return null
            gl.shaderSource(made, source)
            gl.compileShader(made)
            return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null
        }
        const vertex = shader(gl.VERTEX_SHADER, VERTEX)
        const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT)
        const program = gl.createProgram()
        if (!vertex || !fragment || !program) return false
        gl.attachShader(program, vertex)
        gl.attachShader(program, fragment)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false
        gl.useProgram(program)
        this.program = program
        for (const name of ['uTime', 'uDuration', 'uPlot', 'uView', 'uDpr', 'uShape', 'uPass']) this.uniforms[name] = gl.getUniformLocation(program, name)
        this.geometry = gl.createBuffer()
        this.colors = gl.createBuffer()
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.clearColor(0, 0, 0, 0)
        return true
    }

    private upload(): void {
        const gl = this.gl
        if (!gl || !this.program) return
        const stride = 9 * 4
        gl.bindBuffer(gl.ARRAY_BUFFER, this.geometry)
        gl.bufferData(gl.ARRAY_BUFFER, this.points, gl.DYNAMIC_DRAW)
        const attribute = (name: string, size: number, offset: number): void => {
            const location = gl.getAttribLocation(this.program!, name)
            gl.enableVertexAttribArray(location)
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4)
        }
        attribute('aFrom', 4, 0)
        attribute('aTo', 4, 4)
        attribute('aDelay', 1, 8)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colors)
        gl.bufferData(gl.ARRAY_BUFFER, this.tints, gl.DYNAMIC_DRAW)
        const tint = (name: string, offset: number): void => {
            const location = gl.getAttribLocation(this.program!, name)
            gl.enableVertexAttribArray(location)
            gl.vertexAttribPointer(location, 4, gl.UNSIGNED_BYTE, true, 8, offset)
        }
        tint('aFromColor', 0)
        tint('aToColor', 4)
    }

    resize(width: number, height: number, plot: Plot): void {
        this.dpr = Math.min(2, window.devicePixelRatio || 1)
        this.width = width
        this.height = height
        this.plot = plot
        this.canvas.width = Math.round(width * this.dpr)
        this.canvas.height = Math.round(height * this.dpr)
        this.canvas.style.width = `${width}px`
        this.canvas.style.height = `${height}px`
        this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height)
        this.kick()
    }

    /** How far point `index` is through its move, eased, 0..1. */
    private progress(index: number, now: number): number {
        return easeInOut((now - this.start - this.points[index * 9 + 8]) / MOVE_MILLISECONDS)
    }

    /** Moves every point to a new arrangement, from wherever it is now. */
    set(frame: Frame, instant = false): void {
        const now = performance.now()
        const { points, tints, palette } = this
        const shapeNow = this.shapeFrom + (this.shapeTo - this.shapeFrom) * easeInOut((now - this.start) / MOVE_MILLISECONDS)
        let longest = 0
        for (let index = 0; index < this.count; index++) {
            const offset = index * 9
            const k = this.placed ? this.progress(index, now) : 1
            for (let part = 0; part < 4; part++) points[offset + part] = points[offset + part] + (points[offset + 4 + part] - points[offset + part]) * k
            const tint = index * 8
            if (k >= 0.5) for (let part = 0; part < 3; part++) tints[tint + part] = tints[tint + 4 + part]
            points[offset + 4] = frame.x[index]
            points[offset + 5] = frame.y[index]
            points[offset + 6] = frame.radius * (frame.scale ? frame.scale[index] : 1)
            points[offset + 7] = frame.bright ? frame.bright[index] : 1
            const color = frame.color[index] * 3
            tints[tint + 4] = palette[color]
            tints[tint + 5] = palette[color + 1]
            tints[tint + 6] = palette[color + 2]
            if (!this.placed) for (let part = 0; part < 3; part++) tints[tint + part] = tints[tint + 4 + part]
            // The change sweeps across the plot like a wave.
            const delay = instant ? 0 : Math.min(1, Math.max(0, frame.x[index])) * SWEEP_MILLISECONDS + Math.random() * 140
            points[offset + 8] = delay
            if (delay > longest) longest = delay
        }
        this.shapeFrom = this.placed ? shapeNow : frame.shape === 'cell' ? 1 : 0
        this.shapeTo = frame.shape === 'cell' ? 1 : 0
        this.longest = longest
        this.start = instant ? now - MOVE_MILLISECONDS - longest - 1 : now
        this.placed = true
        this.upload()
        this.kick()
    }

    /** Draws on the next frame, and keeps drawing while points are moving. */
    kick(): void {
        if (!this.animation && this.working) this.animation = requestAnimationFrame(this.draw)
    }

    destroy(): void {
        cancelAnimationFrame(this.animation)
        this.animation = 0
        // The canvas may be given to another Points (React remounts effects), so its context is kept.
        this.gl?.deleteBuffer(this.geometry)
        this.gl?.deleteBuffer(this.colors)
        this.gl?.deleteProgram(this.program)
    }

    /** Where point `index` is now, in CSS pixels from the canvas's top left. */
    at(index: number): [number, number] {
        const offset = index * 9
        const k = this.progress(index, performance.now())
        const x = this.points[offset] + (this.points[offset + 4] - this.points[offset]) * k
        const y = this.points[offset + 1] + (this.points[offset + 5] - this.points[offset + 1]) * k
        return [this.plot.x + x * this.plot.width, this.plot.y + y * this.plot.height]
    }

    /** The lit point nearest to a place on the canvas, within `reach` CSS pixels, or -1. */
    pick(x: number, y: number, reach = 16): number {
        if (!this.placed) return -1
        let best = -1
        let nearest = reach * reach
        const { points, plot } = this
        for (let index = 0; index < this.count; index++) {
            const offset = index * 9
            if (points[offset + 7] < 0.5) continue
            const dx = plot.x + points[offset + 4] * plot.width - x
            const dy = plot.y + points[offset + 5] * plot.height - y
            const distance = dx * dx + dy * dy
            if (distance < nearest) {
                nearest = distance
                best = index
            }
        }
        return best
    }

    private draw = (now: number): void => {
        this.animation = 0
        const gl = this.gl
        if (!gl || !this.placed) return
        const elapsed = now - this.start
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(this.uniforms.uTime, elapsed)
        gl.uniform1f(this.uniforms.uDuration, MOVE_MILLISECONDS)
        gl.uniform4f(this.uniforms.uPlot, this.plot.x, this.plot.y, this.plot.width, this.plot.height)
        gl.uniform2f(this.uniforms.uView, this.width, this.height)
        gl.uniform1f(this.uniforms.uDpr, this.dpr)
        gl.uniform1f(this.uniforms.uShape, this.shapeFrom + (this.shapeTo - this.shapeFrom) * easeInOut(elapsed / MOVE_MILLISECONDS))
        for (const pass of [0, 1]) {
            gl.uniform1f(this.uniforms.uPass, pass)
            gl.drawArrays(gl.POINTS, 0, this.count)
        }
        if (elapsed < MOVE_MILLISECONDS + this.longest) this.kick()
    }
}
