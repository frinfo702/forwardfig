import { layout } from './layout'
import { render } from './render'
import { setTex, type TexEngine } from './tex'
import type { Diagram, Dir, Edge, Group, Node } from './types'

// The modeling API. It mirrors how the model is written:
//   Layer   — one block, a callable like nn.Linear / keras.layers.Dense: linear()(x)
//   Module  — a class with forward(), like nn.Module; drawn as a group box
//   Tensor  — a symbolic value flowing between blocks (Keras Functional style)
//   Figure  — the drawing side (like a matplotlib figure): inputs, extra edges, render
// A Layer is one node of the figure: calling it again adds more inputs to the same node.

type V2 = [number, number]
export type Ref = Tensor | Layer<any>

/**
 * Surface of a block. ice / magma are what freeze() / trainable() give; the rest are
 * for whatever a figure wants to call out:
 * glass (soft prompts, adapters), metal (fixed ops, hardware), noise (noise
 * injection, diffusion), quantized (low-bit weights), sparse (pruned), hatch (masked).
 */
export type Texture = 'ice' | 'magma' | 'glass' | 'metal' | 'noise' | 'quantized' | 'sparse' | 'hatch'

export interface NodeOptions {
  id?: string
  /** palette name (pink orange yellow green blue purple teal red gray white) or #hex */
  color?: string
  /** 🧊 frozen weights (ice) */
  frozen?: boolean
  /** 🔥 trainable weights (magma) */
  trainable?: boolean
  /** surface texture; wins over frozen / trainable */
  texture?: Texture
  dashed?: boolean
  bold?: boolean
  /** a ✕ over the block: removed, ablated, dropped */
  crossed?: boolean
  w?: number
  h?: number
  /** stacked copies behind the block, e.g. heads of multi-head attention */
  ghost?: number
  /** small text under the block */
  caption?: string
  // placement: everything is automatic unless one of these is set
  /** cross-axis column; fractions sit between columns */
  lane?: number
  /** same column as another block */
  align?: Ref
  leftOf?: Ref
  rightOf?: Ref
  above?: Ref
  below?: Ref
  /** gap for leftOf/rightOf/above/below (px) */
  dist?: number
  /** absolute position (px) */
  at?: V2
  /** shift after layout (px) */
  nudge?: V2
}
export interface TensorOptions extends NodeOptions { size?: [w: number, h: number, depth: number] }
export interface StackOptions extends NodeOptions { n?: number; size?: V2; offset?: number }
export interface NeuronOptions extends NodeOptions { n?: number }
export interface ImageOptions extends NodeOptions {
  size?: V2
  fit?: 'cover' | 'contain'
  /** overlay a g×g patch grid (ViT) */
  grid?: number
  /** draw a batch of n frames */
  n?: number
  /** degrees: turn the image around its vertical axis, drawn obliquely; positive sends the right edge back (up), negative the left */
  tilt?: number
  /** degrees: rotate in-plane */
  rotate?: number
}
export interface MagnifyOptions extends NodeOptions {
  /** region of the input image to enlarge: [x, y, w, h] as fractions of its frame */
  region?: [number, number, number, number]
  /** or one cell of the input image's patch grid: [column, row] */
  patch?: [number, number]
  /** 'circle' (default): a magnifying glass; 'square': an inset */
  lens?: 'circle' | 'square'
  /** what the lens shows; default: the region cropped from the input image */
  src?: ImageSource
  fit?: 'cover' | 'contain'
  size?: V2
}
/**
 * One cell of a matrix / voxels block: a number in [0, 1] is a shade of the block's
 * color, a string is any color, an object can also set texture, label and crossed.
 */
export type Cell = number | string | { value?: number; color?: string; texture?: Texture; label?: string; crossed?: boolean }
export interface MatrixOptions extends NodeOptions {
  rows?: number
  cols?: number
  /** per cell, as rows of cells or (row, col) => cell; default: varied shades */
  cells?: Cell[][] | ((r: number, c: number) => Cell)
  /** cell size (px, default 16) */
  cellSize?: number
  /** names for the extent along each axis, e.g. { rows: '$T$', cols: '$d$' } */
  axes?: { rows?: string; cols?: string }
}
export interface VoxelOptions extends NodeOptions {
  rows?: number
  cols?: number
  depth?: number
  /** per cell, (row, col, depth) => cell with depth 0 in front, or [row][col][depth]; default: varied shades */
  cells?: Cell[][][] | ((r: number, c: number, d: number) => Cell)
  /** cell size (px, default 16) */
  cellSize?: number
  /** names for the extent along each axis, e.g. { rows: 'H', cols: 'W', depth: 'C' } */
  axes?: { rows?: string; cols?: string; depth?: string }
}
export interface GaussianOptions extends NodeOptions {
  /** [x, y, amplitude?, sigma?] in [-1, 1]²; default one centered bump */
  peaks?: [number, number, number?, number?][]
  size?: V2
  mesh?: number
}
export interface SpaceOptions extends NodeOptions {
  /** [x, y, z, class?] in [-1, 1]³ */
  points?: number[][]
  /** axis names (default x, y, z) */
  axes?: { x?: string; y?: string; z?: string }
  size?: V2
}
export interface PointCloudOptions extends NodeOptions {
  /** [x, y, z, class?] in [-1, 1]³; default: sampled from `shape` */
  points?: number[][]
  shape?: 'torus' | 'sphere' | 'cube'
  /** points sampled when `points` is omitted (default 240) */
  n?: number
  size?: V2
}
export interface WaveformOptions extends NodeOptions {
  /** raw audio in [-1, 1]; reduced to ≤256 min/max columns. Default: a short synthetic utterance */
  samples?: ArrayLike<number>
  size?: V2
}
export interface PlotOptions extends NodeOptions {
  /** domain [min, max] (default [-1, 1]) */
  x?: V2
  /** range [min, max]; default: the sampled min and max */
  y?: V2
  /** x and y axes through the origin, or along the edge when 0 is out of range (default true) */
  axes?: boolean
  /** points sampled across the domain (default 100) */
  samples?: number
  size?: V2
  /** scatter series: [x, y] points drawn with a marker, like matplotlib's scatter */
  points?: PlotSeries[]
  /** the curve's name in the legend */
  name?: string
  /** a key inside the box, for the curve (with `name`) and each labelled series; in the corner that covers the fewest points */
  legend?: boolean
}
export type Marker = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'cross'
export interface PlotSeries {
  at: V2[]
  /** default: circle, square, triangle, ... by series */
  marker?: Marker
  /** default: red, green, orange, ... by series */
  color?: string
  label?: string
  /** marker radius in px (default 3) */
  size?: number
}
export interface SphereOptions extends NodeOptions {
  /** directions [x, y, z, class?]; normalized onto the sphere */
  points?: number[][]
  size?: V2
}

export interface EdgeOptions {
  label?: string
  dashed?: boolean
  arrow?: 'end' | 'both' | 'none'
  thick?: boolean
  /** all-to-all lines between two neurons() layers */
  dense?: boolean
  /** force the detour around blocks (residuals usually get it automatically) */
  skip?: boolean
  curve?: boolean
  /** side a detour runs on: left / right in TB / BT, top / bottom in LR / RL */
  side?: 'left' | 'right' | 'top' | 'bottom'
  color?: string
  /** a ✕ on the edge: a cut connection */
  crossed?: boolean
  /** 'side': come down the source's line and turn into the target's side (an L), e.g. conditioning taps */
  join?: 'side'
}

// --- tensors and the trace graph

type Rec = { id: string; mods: Module<any>[]; groups: string[] }

/** @internal the trace a Figure records into */
export class Graph {
  nodes = new Map<Layer<any>, Rec>()
  edges: { from: string; to: Ref; style: EdgeOptions }[] = []
  groups = new Map<Module<any>, Group>()
  scope: Module<any>[] = []
  ranks: Ref[][] = []
  ids = new Set<string>()

  /** a user id must be unique; an auto id (prefix + counter) skips taken ones */
  claim(id: string | undefined, prefix: string, i: number): string {
    if (id === undefined) while (this.ids.has(id = `${prefix}${i}`)) i++
    else if (this.ids.has(id)) throw new Error(`duplicate id "${id}"`)
    this.ids.add(id)
    return id
  }
  node(L: Layer<any>): string {
    let r = this.nodes.get(L)
    if (!r) {
      const id = this.claim(L.options.id, 'n', this.nodes.size)
      const groups = this.scope.map(m => this.groups.get(m)?.id).filter((g): g is string => !!g)
      r = { id, mods: [...this.scope], groups }
      this.nodes.set(L, r)
    }
    return r.id
  }
  apply(L: Layer<any>, xs: Tensor[]): Tensor {
    const id = this.node(L)
    for (const x of xs) this.edges.push({ from: x.node, to: L, style: x.style })
    return new Tensor(this, id)
  }
  enter(m: Module<any>) {
    const o = m.options
    if ((o.box ?? !!(o.label || o.repeat)) && !this.groups.has(m)) {
      const parent = [...this.scope].reverse().map(p => this.groups.get(p)).find(Boolean)
      this.groups.set(m, {
        id: this.claim(o.id, 'g', this.groups.size), label: o.label ?? '', parent: parent?.id,
        flags: new Set(o.dashed ? ['dashed'] : []), attrs: { ...(o.repeat && { repeat: o.repeat }), ...(o.repeatSide && { 'repeat-side': o.repeatSide }), ...(o.color && { color: o.color }), ...(o.texture && { texture: o.texture }) },
        x: 0, y: 0, w: 0, h: 0,
      })
    }
    this.scope.push(m)
  }
  id(r: Ref): string {
    if (r instanceof Tensor) return r.node
    const rec = this.nodes.get(r)
    if (!rec) throw new Error(`"${r.label}" is not part of this figure`)
    return rec.id
  }
}

export class Tensor {
  /** @internal */
  constructor(readonly graph: Graph, readonly node: string, readonly style: EdgeOptions = {}) {}
  /** Style the edge(s) this tensor flows into next: x.edge('$r$'), x.edge({ dashed: true }) */
  edge(style: EdgeOptions | string): Tensor {
    return new Tensor(this.graph, this.node, { ...this.style, ...(typeof style === 'string' ? { label: style } : style) })
  }
}

const graphOf = (xs: Tensor[], who: string) => {
  const g = xs[0]?.graph
  if (!g) throw new Error(`${who} was called without inputs; start from fig.input()`)
  if (xs.some(x => !(x instanceof Tensor) || x.graph !== g)) throw new Error(`${who}: inputs must be Tensors of the same figure`)
  return g
}

// --- layers

export type Shape = 'block' | 'thin' | 'text' | 'circle' | 'op' | 'enc' | 'dec' | 'tensor' | 'stack' | 'neurons' | 'empty'
  | 'vector' | 'matrix' | 'voxels' | 'image' | 'magnify' | 'gaussian' | 'space' | 'sphere' | 'pointcloud' | 'waveform' | 'plot'

export interface Layer<O extends NodeOptions = NodeOptions> {
  (...inputs: Tensor[]): Tensor
  readonly shape: Shape
  /** preset name, used to look up `kinds` in a style config (e.g. 'mha', 'norm', 'block') */
  readonly kind: string
  label: string
  /** what the caller passed; always wins */
  options: O
  /** what the preset supplies; loses to any style config */
  readonly defaults: NodeOptions
  /** mark as frozen (🧊) */
  freeze(): this
  /** mark as trainable (🔥) */
  trainable(): this
}

export function layer<O extends NodeOptions>(shape: Shape, label: string, options: O, kind: string = shape, defaults: NodeOptions = {}): Layer<O> {
  const L = ((...xs: Tensor[]) => graphOf(xs, `"${L.label}"`).apply(L, xs)) as Layer<O>
  return Object.assign(L, {
    shape, kind, label, options, defaults,
    freeze() { L.options.frozen = true; L.options.trainable = false; return L },
    trainable() { L.options.trainable = true; L.options.frozen = false; return L },
  })
}

export type Factory<O extends NodeOptions = NodeOptions> = { (label?: string, options?: O): Layer<O>; (options?: O): Layer<O> }

/**
 * Define a block type, the way the built-in presets are defined:
 *   const rmsnorm = preset('thin', 'RMSNorm', 'yellow')
 *   const moe = preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })
 * The third argument is a color or default options. `kind` (default: the shape)
 * is the key a style config's `kinds` uses.
 */
export function preset<O extends NodeOptions = NodeOptions>(shape: Shape, label = '', defaults: string | (NodeOptions & { kind?: string }) = {}): Factory<O> {
  const { kind = shape, ...base } = typeof defaults === 'string' ? { color: defaults } : defaults
  return ((a?: string | O, b?: O) => {
    const [l, o] = typeof a === 'string' ? [a, b ?? ({} as O)] : [label, a ?? ({} as O)]
    return layer(shape, l, { ...o }, kind, base)
  }) as Factory<O>
}

// basic shapes
export const block = preset('block')
export const thin = preset('thin')
export const text = preset('text')
export const circle = preset('circle')
export const op = preset('op', '+')
export const enc = preset('enc', 'Encoder', 'blue')
export const dec = preset('dec', 'Decoder', 'green')
export const tensor = preset<TensorOptions>('tensor', '', 'blue')
export const stack = preset<StackOptions>('stack', '', 'blue')
export const neurons = preset<NeuronOptions>('neurons')
/** Empty space: a point that draws nothing, for arrows that come from or go into the void. */
export const empty = preset('empty')
export function vector(values: string[], a?: string | NodeOptions, b?: NodeOptions): Layer<NodeOptions> {
  const [label, o] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  return layer('vector', label, { ...o, values } as NodeOptions)
}
// ML presets
export const mha = preset('block', 'Multi-Head Attention', { color: 'orange', kind: 'mha' })
export const attention = preset('block', 'Attention', { color: 'orange', kind: 'attention' })
export const ffn = preset('block', 'Feed Forward', { color: 'blue', kind: 'ffn' })
export const mlp = preset('block', 'MLP', { color: 'blue', kind: 'mlp' })
export const norm = preset('thin', 'Add & Norm', { color: 'yellow', kind: 'norm' })
export const embed = preset('block', 'Embedding', { color: 'pink', kind: 'embed' })
export const linear = preset('thin', 'Linear', { color: 'purple', kind: 'linear' })
export const softmax = preset('thin', 'Softmax', { color: 'green', kind: 'softmax' })
export const matmul = preset('thin', 'MatMul', { color: 'purple', kind: 'matmul' })
export const concat = preset('thin', 'Concat', { color: 'yellow', kind: 'concat' })
export const conv = preset('block', 'Conv', { color: 'teal', kind: 'conv' })
export const pool = preset('thin', 'Pool', { color: 'gray', kind: 'pool' })
export const act = preset('thin', 'ReLU', { color: 'green', kind: 'act' })
export const dropout = preset('thin', 'Dropout', { color: 'gray', kind: 'dropout' })
export const loss = preset('block', 'Loss', { color: 'red', kind: 'loss' })
// 3D
export const gaussian = preset<GaussianOptions>('gaussian', '', 'purple')
export const space = preset<SpaceOptions>('space', '', 'gray')
export const sphere = preset<SphereOptions>('sphere', '', 'blue')
export const pointcloud = preset<PointCloudOptions>('pointcloud', '', 'blue')

/** Audio as a waveform. Long signals are reduced to min/max columns, so the SVG stays small. */
export function waveform(a?: string | WaveformOptions, b?: WaveformOptions): Layer<WaveformOptions> {
  const [label, { samples, ...o }] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  let wave: number[][] | undefined
  if (samples?.length) {
    const cols = Math.min(256, samples.length), r = (v: number) => Math.round(v * 1000) / 1000
    wave = Array.from({ length: cols }, (_, i) => {
      let lo = Infinity, hi = -Infinity
      for (let j = Math.floor((i * samples.length) / cols); j < Math.floor(((i + 1) * samples.length) / cols); j++) {
        lo = Math.min(lo, samples[j]); hi = Math.max(hi, samples[j])
      }
      return [r(lo), r(hi)]
    })
  }
  return layer('waveform', label, { ...o, ...(wave && { wave }) } as WaveformOptions, 'waveform', { color: 'teal' })
}

const MARKERS: Marker[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross']
const SERIES_COLORS = ['red', 'green', 'orange', 'purple', 'teal', 'pink']
/**
 * The graph of y = fn(x), e.g. plot(Math.sin, { x: [-Math.PI, Math.PI] }). NaN / ±Infinity break the curve.
 * `points` adds scatter series, and fn may be left out: plot({ points: [{ at: [[0, 1], [1, 2]], marker: 'star' }] }).
 */
export function plot(f?: ((x: number) => number) | string | PlotOptions, a?: string | PlotOptions, b?: PlotOptions): Layer<PlotOptions> {
  const fn = typeof f === 'function' ? f : undefined
  if (!fn) [a, b] = [f as string | PlotOptions | undefined, a as PlotOptions] // no fn: the arguments shift left
  const [label, { samples = 100, ...o }] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  const points = (o.points ?? []).map((p, i) => ({ ...p, marker: p.marker ?? MARKERS[i % MARKERS.length], color: p.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }))
  const at = points.flatMap(p => p.at), ext = (v: number[], def: V2): V2 => v.length ? [Math.min(...v), Math.max(...v)] : def
  // domain: given, else the points' extent, else [-1, 1]
  const [x0, x1] = o.x ?? ext(at.map(p => p[0]).filter(Number.isFinite), [-1, 1]), k = Math.max(2, Math.round(samples))
  const ys = fn ? Array.from({ length: k }, (_, i) => Math.round(fn(x0 + ((x1 - x0) * i) / (k - 1)) * 1e4) / 1e4) : []
  const y = o.y ?? ext([...ys, ...at.map(p => p[1])].filter(Number.isFinite), [-1, 1])
  return layer('plot', label, { ...o, x: [x0, x1], y, ys, ...(points.length && { points }) } as PlotOptions, 'plot', { color: 'blue' })
}

export type ImageSource = string | { currentSrc?: string; src?: string } | { toDataURL(type?: string): string }
const href = (s: ImageSource) => typeof s === 'string' ? s : 'toDataURL' in s ? s.toDataURL('image/png') : s.currentSrc || s.src || ''
/**
 * A real image: URL, data URL, <img> or <canvas>. An array draws a stack of
 * frames, the first one in front: image([t0, t1, t2], { tilt: 35 }).
 */
export function image(src: ImageSource | ImageSource[], a?: string | ImageOptions, b?: ImageOptions): Layer<ImageOptions> {
  const [label, o] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  const srcs = Array.isArray(src) ? src.map(href) : [href(src)]
  return layer('image', label, { n: srcs.length > 1 ? srcs.length : undefined, ...o, src: srcs[0], ...(srcs.length > 1 && { srcs }) } as ImageOptions)
}
/**
 * Enlarge part of the image it's called on, like a magnifying glass: magnify({ patch: [1, 2] })(img).
 * `src` puts your own picture in the lens (e.g. a high-resolution crop) instead of the cropped region.
 */
export function magnify(a?: string | MagnifyOptions, b?: MagnifyOptions): Layer<MagnifyOptions> {
  const [label, { src, ...o }] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  return layer('magnify', label, { ...o, ...(src && { src: href(src) }) } as MagnifyOptions, 'magnify', { color: 'orange' })
}

// cells are evaluated here, so the figure stores plain data (only the visible ones for voxels)
type CellData = { v?: number; c?: string; t?: Texture; l?: string; x?: boolean }
const cellData = (c: Cell | undefined, seed: number): CellData =>
  c === undefined ? { v: Math.abs(Math.sin(seed * 12.9898 + 4.1) * 43758.5453) % 1 }
    : typeof c === 'number' ? { v: c } : typeof c === 'string' ? { c }
      : { v: c.value, c: c.color, t: c.texture, l: c.label, x: c.crossed }

/** A grid of cells, each with its own shade, color, texture or label. */
export function matrix(a?: string | MatrixOptions, b?: MatrixOptions): Layer<MatrixOptions> {
  const [label, { cells, ...o }] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  const rows = o.rows ?? (Array.isArray(cells) ? cells.length : 5), cols = o.cols ?? (Array.isArray(cells) ? Math.max(0, ...cells.map(r => r.length)) : 5)
  const at = (r: number, c: number) => (typeof cells === 'function' ? cells(r, c) : cells?.[r]?.[c])
  const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cellData(at(r, c), r * 31 + c)))
  return layer('matrix', label, { ...o, rows, cols, grid } as MatrixOptions, 'matrix', { color: 'blue' })
}

/** A block of voxels seen from the front, top and right, each cell with its own look. */
export function voxels(a?: string | VoxelOptions, b?: VoxelOptions): Layer<VoxelOptions> {
  const [label, { cells, ...o }] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  const arr = Array.isArray(cells) ? cells : undefined
  const rows = o.rows ?? arr?.length ?? 5, cols = o.cols ?? (arr ? Math.max(0, ...arr.map(r => r.length)) : 5)
  const depth = o.depth ?? (arr ? Math.max(0, ...arr.flatMap(r => r.map(c => c.length))) : 5)
  const at = (r: number, c: number, d: number) => cellData(typeof cells === 'function' ? cells(r, c, d) : cells?.[r]?.[c]?.[d], r * 97 + c * 31 + d * 7)
  const face = (n: number, m: number, f: (i: number, j: number) => CellData) => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => f(i, j)))
  const faces = {
    front: face(rows, cols, (r, c) => at(r, c, 0)),
    top: face(depth, cols, (d, c) => at(0, c, d)),
    side: face(rows, depth, (r, d) => at(r, cols - 1, d)),
  }
  return layer('voxels', label, { ...o, rows, cols, depth, faces } as VoxelOptions, 'voxels', { color: 'blue' })
}

// functional ops: a fresh node per call, like torch.add
export const add = (...xs: Tensor[]) => op('+')(...xs)
export const mul = (...xs: Tensor[]) => op('*')(...xs)

// --- style config

/** What a style config can set on blocks. */
export interface Style {
  color?: string
  texture?: Texture
  /** label size (px); at figure / configure level it also sizes edge, group and caption text */
  fontSize?: number
  /** CSS font family; at figure / configure level it sets the whole figure's font */
  fontFamily?: string
  dashed?: boolean
  bold?: boolean
}
/** `style` applies to every block in scope, `kinds` to one preset (wins over `style` at the same level). */
export interface StyleConfig {
  style?: Style
  kinds?: Record<string, Style>
}

// --- modules

export interface ModuleOptions extends StyleConfig {
  id?: string
  /** group title */
  label?: string
  /** side note such as "N×" */
  repeat?: string
  /** where `repeat` goes; 'auto' (default) takes the first side that collides with nothing */
  repeatSide?: 'auto' | 'top' | 'bottom' | 'left' | 'right'
  /** draw a group box (default: when label or repeat is given) */
  box?: boolean
  color?: string
  dashed?: boolean
  /** texture of the group box */
  texture?: Texture
  /** 🧊 every block inside, like freeze() */
  frozen?: boolean
  /** 🔥 every block inside, like trainable() */
  trainable?: boolean
}

export interface Module<O = Tensor> {
  (...inputs: Tensor[]): O
}
/**
 * Subclass and implement forward(), like nn.Module. Instances are callable:
 * `this.attn(x)` inside forward, `model(x)` in a figure.
 */
export abstract class Module<O = Tensor> {
  declare options: ModuleOptions
  constructor(options: ModuleOptions = {}) {
    const self = ((...xs: Tensor[]) => {
      const g = graphOf(xs, self.constructor.name || 'module')
      g.enter(self)
      try { return self.forward(...xs) } finally { g.scope.pop() }
    }) as unknown as Module<O>
    // the instance is the function itself; drop its own name/length so subclass fields can use them
    delete (self as any).name
    delete (self as any).length
    Object.setPrototypeOf(self, new.target.prototype)
    self.options = { ...options }
    return self
  }
  abstract forward(...inputs: Tensor[]): O
  /** freeze every block created inside (🧊), like requires_grad_(False) */
  freeze(): this { this.options.frozen = true; this.options.trainable = false; return this }
  /** mark every block created inside as trainable (🔥) */
  trainable(): this { this.options.trainable = true; this.options.frozen = false; return this }
}

// --- figure

export interface FigureOptions extends StyleConfig {
  flow?: Dir
  theme?: 'light' | 'dark'
  /** [along the flow, across it] in px */
  gap?: V2
  /** bake WebGL ice / magma when available (default true) */
  materials?: boolean
  /** a key to the looks used: ❄ frozen, 🔥 trainable, each texture, ✕ crossed */
  legend?: boolean | LegendOptions
}
export interface LegendOptions {
  /** default 'bottom' */
  position?: 'bottom' | 'right'
  /** names to show instead of the defaults, e.g. { trainable: 'Trained', quantized: '4-bit' } */
  labels?: Partial<Record<'frozen' | 'trainable' | Exclude<Texture, 'ice' | 'magma'> | 'crossed', string>>
}

export type { TexEngine }
/** configure() also takes the TeX engine: MathJax is used automatically when the page has it */
export interface Config extends FigureOptions {
  /** tex → <svg viewBox> (MathJax tex2svg shape); null = built-in fallback only */
  tex?: TexEngine | null
}

let defaults: FigureOptions = {}
/**
 * Library-wide defaults, like matplotlib's rcParams. Figures, modules and blocks
 * override them; `configure(null)` resets. Returns the current config.
 *   configure({ style: { fontSize: 14, color: 'gray' }, kinds: { mha: { color: 'purple' } } })
 */
export function configure(config: Config | null): FigureOptions {
  if (config === null) setTex(undefined)
  else if ('tex' in config) setTex(config.tex)
  const { tex: _, ...rest } = config ?? {}
  defaults = config === null ? {} : merge(defaults, rest)
  return structuredClone(defaults)
}
const merge = (a: FigureOptions, b: FigureOptions): FigureOptions => {
  const kinds = { ...a.kinds }
  for (const [k, v] of Object.entries(b.kinds ?? {})) kinds[k] = { ...kinds[k], ...v }
  return { ...a, ...b, style: { ...a.style, ...b.style }, kinds }
}
// later entries win; undefined never overrides
const cascade = (...layers: (object | undefined)[]) => {
  const out: Record<string, unknown> = {}
  for (const l of layers) for (const [k, v] of Object.entries(l ?? {})) if (v !== undefined) out[k] = v
  return out
}

const SKIP = new Set(['id', 'color', 'frozen', 'trainable', 'dashed', 'bold', 'crossed'])
const KEY: Record<string, string> = { leftOf: 'left-of', rightOf: 'right-of' }

export class Figure {
  readonly options: FigureOptions
  private g = new Graph()
  constructor(options: FigureOptions = {}) { this.options = { ...options } }

  /** A starting point: a text label, or any layer used as a source (options are added to it). */
  input(what: string | Layer<any> = '', options: NodeOptions = {}): Tensor {
    if (typeof what !== 'string') Object.assign(what.options, options)
    const L = typeof what === 'string' ? text(what, options) : what
    return new Tensor(this.g, this.g.node(L))
  }
  /** An extra edge that isn't a forward call, e.g. a backward process. */
  edge(from: Tensor, to: Ref, style: EdgeOptions | string = {}): this {
    if (from.graph !== this.g) throw new Error('edge: tensor belongs to another figure')
    if (!(to instanceof Tensor)) this.g.node(to)
    this.g.edges.push({ from: from.node, to, style: { ...from.style, ...(typeof style === 'string' ? { label: style } : style) } })
    return this
  }
  /** Put blocks on the same rank (row in TB/BT, column in LR/RL). */
  rank(...refs: Ref[]): this { this.g.ranks.push(refs); return this }

  /** Compile to the drawing core's plain data. */
  diagram(): Diagram {
    const g = this.g, nodes = new Map<string, Node>(), cfg = merge(defaults, this.options)
    let order = 0
    for (const [L, r] of g.nodes) {
      // preset defaults < configure() < figure < outer module < inner module < the block's own options
      const scopes: (StyleConfig | undefined)[] = [cfg, ...r.mods.map(m => m.options)]
      const own = L.options as Record<string, unknown> & NodeOptions
      const o = cascade(L.defaults, ...scopes.flatMap(c => [c?.style, c?.kinds?.[L.kind]]), own) as Record<string, unknown> & NodeOptions
      let label = L.label
      const strip = (e: string) => {
        if (!label.includes(e)) return false
        label = label.replace(e, '').trim()
        return true
      }
      const iced = strip('🧊'), fired = strip('🔥')
      const inherited = [...r.mods].reverse().map(m => m.options).find(m => m.frozen || m.trainable)
      const fx = own.frozen || iced ? 'frozen' : own.trainable || fired ? 'train' : inherited?.frozen ? 'frozen' : inherited?.trainable ? 'train' : ''
      // a styled texture must not hide what freeze() / trainable() say; only the block's own texture may
      if (fx && !own.texture) delete o.texture
      const flags = new Set([fx, o.dashed && 'dashed', o.bold && 'bold', o.crossed && 'crossed'].filter((f): f is string => !!f))
      const attrs: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) {
        if (SKIP.has(k) || v === undefined) continue
        attrs[KEY[k] ?? k] = v instanceof Tensor || typeof v === 'function' ? g.id(v as Ref)
          : Array.isArray(v) && v.every(x => typeof x === 'number') ? v.join(',')
            : typeof v === 'object' ? JSON.stringify(v) : String(v)
      }
      nodes.set(r.id, { id: r.id, shape: L.shape, label, color: o.color, flags, attrs, groups: r.groups, order: order++, x: 0, y: 0, w: 0, h: 0 })
    }
    const edges: Edge[] = g.edges.map(({ from, to, style: s }) => ({
      from, to: g.id(to), label: s.label, pts: [],
      op: s.dense ? '=>' : s.arrow === 'none' ? (s.dashed ? '..' : '--') : s.arrow === 'both' ? '<->' : s.dashed ? '..>' : '->',
      flags: new Set([...(['skip', 'curve', 'thick', 'dashed', 'crossed'] as const).filter(k => s[k]), ...(s.join ? ['join'] : [])]),
      attrs: { ...(s.side && { side: s.side }), ...(s.color && { color: s.color }) },
    }))
    return {
      dir: cfg.flow ?? 'TB', theme: cfg.theme ?? 'light', gap: cfg.gap, fontSize: cfg.style?.fontSize, fontFamily: cfg.style?.fontFamily,
      legend: cfg.legend === true ? {} : cfg.legend || undefined,
      nodes, edges, groups: [...g.groups.values()].map(x => ({ ...x, flags: new Set(x.flags) })), ranks: g.ranks.map(rs => rs.map(r => g.id(r))),
    }
  }
  /** Render to an SVG string (works without a DOM). */
  svg(options: { theme?: 'light' | 'dark' } = {}): string {
    const d = this.diagram()
    return render(layout(d), options.theme ?? d.theme, merge(defaults, this.options).materials ?? true)
  }
  /** Export as svg / png / jpeg / webp. Raster formats need a browser. */
  async toBlob(options: ExportOptions = {}): Promise<Blob> {
    const format = options.format ?? 'svg', svg = this.svg({ theme: options.theme })
    if (format === 'svg') return new Blob([svg], { type: 'image/svg+xml' })
    if (!['png', 'jpeg', 'webp'].includes(format)) throw new Error(`export: unknown format "${format}" (svg, png, jpeg, webp)`)
    return rasterize(svg, { ...options, format }, `image/${format}`)
  }
  /** Save to a file; the format follows the extension: fig.download('figure.png') */
  async download(filename = 'figure.svg', options: ExportOptions = {}): Promise<void> {
    const ext = /\.(\w+)$/.exec(filename)?.[1].toLowerCase()
    const format = options.format ?? ((ext === 'jpg' ? 'jpeg' : ext) as ExportFormat | undefined) ?? 'svg'
    const url = URL.createObjectURL(await this.toBlob({ ...options, format }))
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  /** Render into an element (or a CSS selector). */
  mount(target: string | Element, options: { theme?: 'light' | 'dark' } = {}): this {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) throw new Error(`mount: no element matches "${target}"`)
    el.innerHTML = this.svg(options)
    return this
  }
}

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'webp'
export interface ExportOptions {
  /** default: from the file name in download(), else 'svg' */
  format?: ExportFormat
  theme?: 'light' | 'dark'
  /** raster resolution multiplier (default 2) */
  scale?: number
  /** raster background; default transparent (white for jpeg, or the theme's background) */
  background?: string
  /** jpeg / webp quality 0–1 (default 0.92) */
  quality?: number
}

// Raster export draws the SVG as an image, where external URLs don't load: inline them first.
async function inlineImages(svg: string): Promise<string> {
  const urls = [...new Set([...svg.matchAll(/<image href="(?!data:)([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')))]
  for (const url of urls) {
    try {
      const blob = await (await fetch(url)).blob()
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = rej
        r.readAsDataURL(blob)
      })
      svg = svg.split(`href="${url.replace(/&/g, '&amp;')}"`).join(`href="${data}"`)
    } catch { /* leave it; the browser will show the frame without the picture */ }
  }
  return svg
}

async function rasterize(svg: string, o: ExportOptions, mime: string): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error(`export: ${o.format} needs a browser (canvas); in Node use svg()`)
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg) ?? []
  const k = o.scale ?? 2, img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await inlineImages(svg))
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(+w * k)
  canvas.height = Math.ceil(+h * k)
  const ctx = canvas.getContext('2d')!
  const bg = o.background ?? (mime === 'image/jpeg' ? '#ffffff' : '')
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('export: canvas.toBlob failed'))), mime, o.quality ?? 0.92))
}

/** Build a figure in one block: figure(fig => { ... }) or figure({ flow: 'BT' }, fig => { ... }) */
export function figure(build: (fig: Figure) => unknown): Figure
export function figure(options: FigureOptions, build: (fig: Figure) => unknown): Figure
export function figure(a: FigureOptions | ((fig: Figure) => unknown), b?: (fig: Figure) => unknown): Figure {
  const [options, build] = typeof a === 'function' ? [{}, a] : [a, b!]
  const f = new Figure(options)
  build(f)
  return f
}
