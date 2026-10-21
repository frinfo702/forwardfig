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
 * Surface of a block. ice / magma are what freeze() / train() give; the rest are
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
  train?: boolean
  /** surface texture; wins over frozen / train */
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
  /** degrees: turn the image around its vertical axis, drawn obliquely (negative turns the other way) */
  tilt?: number
  /** degrees: rotate in-plane */
  rotate?: number
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
  axes?: [string, string, string]
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
  side?: 'left' | 'right' | 'top' | 'bottom'
  color?: string
  /** a ✕ on the edge: a cut connection */
  crossed?: boolean
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

  node(L: Layer<any>): string {
    let r = this.nodes.get(L)
    if (!r) {
      const id = L.options.id ?? `n${this.nodes.size}`
      if (this.ids.has(id)) throw new Error(`duplicate id "${id}"`)
      this.ids.add(id)
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
        id: o.id ?? `g${this.groups.size}`, label: o.label ?? '', parent: parent?.id,
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

export type Shape = 'block' | 'thin' | 'text' | 'circle' | 'op' | 'enc' | 'dec' | 'tensor' | 'stack' | 'neurons'
  | 'vector' | 'image' | 'gaussian' | 'space' | 'sphere' | 'pointcloud' | 'waveform'

export interface Layer<O extends NodeOptions = NodeOptions> {
  (...inputs: Tensor[]): Tensor
  readonly shape: string
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
  train(): this
}

export function layer<O extends NodeOptions>(shape: string, label: string, options: O, kind = shape, defaults: NodeOptions = {}): Layer<O> {
  const L = ((...xs: Tensor[]) => graphOf(xs, `"${L.label}"`).apply(L, xs)) as Layer<O>
  return Object.assign(L, {
    shape, kind, label, options, defaults,
    freeze() { L.options.frozen = true; L.options.train = false; return L },
    train() { L.options.train = true; L.options.frozen = false; return L },
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
  const s = shape === 'circle' ? 'var' : shape
  return ((a?: string | O, b?: O) => {
    const [l, o] = typeof a === 'string' ? [a, b ?? ({} as O)] : [label, a ?? ({} as O)]
    return layer(s, l, { ...o }, kind, base)
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
export const vector = (values: string[], options: NodeOptions = {}) => layer('vector', '', { ...options, values })
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

export type ImageSource = string | { currentSrc?: string; src?: string } | { toDataURL(type?: string): string }
/** A real image: URL, data URL, <img> or <canvas>. */
export function image(src: ImageSource, a?: string | ImageOptions, b?: ImageOptions): Layer<ImageOptions> {
  const href = typeof src === 'string' ? src : 'toDataURL' in src ? src.toDataURL('image/png') : src.currentSrc || src.src || ''
  const [label, o] = typeof a === 'string' ? [a, b ?? {}] : ['', a ?? {}]
  return layer('image', label, { ...o, src: href } as ImageOptions)
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
}

export interface Module<O = Tensor> {
  (...inputs: Tensor[]): O
}
/**
 * Subclass and implement forward(), like nn.Module. Instances are callable:
 * `this.attn(x)` inside forward, `model(x)` in a figure.
 */
export abstract class Module<O = Tensor> {
  declare options: ModuleOptions & { frozen?: boolean; train?: boolean }
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
  freeze(): this { this.options.frozen = true; this.options.train = false; return this }
  /** mark every block created inside as trainable (🔥) */
  train(): this { this.options.train = true; this.options.frozen = false; return this }
}

// --- figure

export interface FigureOptions extends StyleConfig {
  flow?: Dir
  theme?: 'light' | 'dark'
  /** [along the flow, across it] in px */
  gap?: V2
  /** bake WebGL ice / magma when available (default true) */
  materials?: boolean
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
  return defaults
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

const SKIP = new Set(['id', 'color', 'frozen', 'train', 'dashed', 'bold', 'crossed'])
const KEY: Record<string, string> = { leftOf: 'left-of', rightOf: 'right-of' }

export class Figure {
  readonly options: FigureOptions
  private g = new Graph()
  constructor(options: FigureOptions = {}) { this.options = { ...options } }

  /** A starting point: a text label, or any layer used as a source. */
  input(what: string | Layer<any> = '', options: NodeOptions = {}): Tensor {
    const L = typeof what === 'string' ? text(what, options) : what
    return new Tensor(this.g, this.g.node(L))
  }
  /** An extra edge that isn't a forward call, e.g. a backward process. */
  edge(from: Tensor, to: Ref, style: EdgeOptions | string = {}): this {
    if (from.graph !== this.g) throw new Error('edge: tensor belongs to another figure')
    if (!(to instanceof Tensor)) this.g.node(to)
    this.g.edges.push({ from: from.node, to, style: typeof style === 'string' ? { label: style } : style })
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
      const inherited = [...r.mods].reverse().map(m => m.options).find(m => m.frozen || m.train)
      const fx = own.frozen || iced ? 'frozen' : own.train || fired ? 'train' : inherited?.frozen ? 'frozen' : inherited?.train ? 'train' : ''
      // a styled texture must not hide what freeze() / train() say; only the block's own texture may
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
      flags: new Set((['skip', 'curve', 'thick', 'dashed', 'crossed'] as const).filter(k => s[k])),
      attrs: { ...(s.side && { side: s.side }), ...(s.color && { color: s.color }) },
    }))
    return {
      dir: cfg.flow ?? 'TB', theme: cfg.theme ?? 'light', gap: cfg.gap, fontSize: cfg.style?.fontSize,
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

/** Build a figure in one block: figure({ flow: 'BT' }, fig => { ... }) */
export function figure(options: FigureOptions, build: (fig: Figure) => unknown): Figure {
  const f = new Figure(options)
  build(f)
  return f
}
