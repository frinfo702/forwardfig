import { layout } from './layout'
import { render } from './render'
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
        flags: new Set(o.dashed ? ['dashed'] : []), attrs: { ...(o.repeat && { repeat: o.repeat }), ...(o.color && { color: o.color }), ...(o.texture && { texture: o.texture }) },
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

export interface Layer<O extends NodeOptions = NodeOptions> {
  (...inputs: Tensor[]): Tensor
  readonly shape: string
  label: string
  options: O
  /** mark as frozen (🧊) */
  freeze(): this
  /** mark as trainable (🔥) */
  train(): this
}

export function layer<O extends NodeOptions>(shape: string, label: string, options: O): Layer<O> {
  const L = ((...xs: Tensor[]) => graphOf(xs, `"${L.label}"`).apply(L, xs)) as Layer<O>
  return Object.assign(L, {
    shape, label, options,
    freeze() { L.options.frozen = true; L.options.train = false; return L },
    train() { L.options.train = true; L.options.frozen = false; return L },
  })
}

type Factory<O extends NodeOptions> = { (label?: string, options?: O): Layer<O>; (options?: O): Layer<O> }
const factory = <O extends NodeOptions = NodeOptions>(shape: string, def = '', color?: string): Factory<O> =>
  (a?: string | O, b?: O) => {
    const [label, o] = typeof a === 'string' ? [a, b ?? ({} as O)] : [def, a ?? ({} as O)]
    return layer(shape, label, color && !o.color ? { ...o, color } : { ...o })
  }

// basic shapes
export const block = factory('block')
export const thin = factory('thin')
export const text = factory('text')
export const circle = factory('var')
export const op = factory('op', '+')
export const enc = factory('enc', 'Encoder', 'blue')
export const dec = factory('dec', 'Decoder', 'green')
export const tensor = factory<TensorOptions>('tensor', '', 'blue')
export const stack = factory<StackOptions>('stack', '', 'blue')
export const neurons = factory<NeuronOptions>('neurons')
export const vector = (values: string[], options: NodeOptions = {}) => layer('vector', '', { ...options, values })
// ML presets
export const mha = factory('block', 'Multi-Head Attention', 'orange')
export const attention = factory('block', 'Attention', 'orange')
export const ffn = factory('block', 'Feed Forward', 'blue')
export const mlp = factory('block', 'MLP', 'blue')
export const norm = factory('thin', 'Add & Norm', 'yellow')
export const embed = factory('block', 'Embedding', 'pink')
export const linear = factory('thin', 'Linear', 'purple')
export const softmax = factory('thin', 'Softmax', 'green')
export const matmul = factory('thin', 'MatMul', 'purple')
export const concat = factory('thin', 'Concat', 'yellow')
export const conv = factory('block', 'Conv', 'teal')
export const pool = factory('thin', 'Pool', 'gray')
export const act = factory('thin', 'ReLU', 'green')
export const dropout = factory('thin', 'Dropout', 'gray')
export const loss = factory('block', 'Loss', 'red')
// 3D
export const gaussian = factory<GaussianOptions>('gaussian', '', 'purple')
export const space = factory<SpaceOptions>('space', '', 'gray')
export const sphere = factory<SphereOptions>('sphere', '', 'blue')

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

// --- modules

export interface ModuleOptions {
  id?: string
  /** group title */
  label?: string
  /** side note such as "N×" */
  repeat?: string
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

export interface FigureOptions {
  flow?: Dir
  theme?: 'light' | 'dark'
  /** [along the flow, across it] in px */
  gap?: V2
  /** bake WebGL ice / magma when available (default true) */
  materials?: boolean
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
    const g = this.g, nodes = new Map<string, Node>()
    let order = 0
    for (const [L, r] of g.nodes) {
      const o = L.options as Record<string, unknown> & NodeOptions
      const inherited = [...r.mods].reverse().map(m => m.options).find(m => m.frozen || m.train)
      const fx = o.frozen ? 'frozen' : o.train ? 'train' : inherited?.frozen ? 'frozen' : inherited?.train ? 'train' : ''
      const flags = new Set([fx, o.dashed && 'dashed', o.bold && 'bold', o.crossed && 'crossed'].filter((f): f is string => !!f))
      const attrs: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) {
        if (SKIP.has(k) || v === undefined) continue
        attrs[KEY[k] ?? k] = v instanceof Tensor || typeof v === 'function' ? g.id(v as Ref)
          : Array.isArray(v) && v.every(x => typeof x === 'number') ? v.join(',')
            : typeof v === 'object' ? JSON.stringify(v) : String(v)
      }
      let label = L.label
      if (label.includes('🧊')) { flags.add('frozen'); label = label.replace('🧊', '').trim() }
      if (label.includes('🔥')) { flags.add('train'); label = label.replace('🔥', '').trim() }
      nodes.set(r.id, { id: r.id, shape: L.shape, label, color: o.color, flags, attrs, groups: r.groups, order: order++, x: 0, y: 0, w: 0, h: 0 })
    }
    const edges: Edge[] = g.edges.map(({ from, to, style: s }) => ({
      from, to: g.id(to), label: s.label, pts: [],
      op: s.dense ? '=>' : s.arrow === 'none' ? (s.dashed ? '..' : '--') : s.arrow === 'both' ? '<->' : s.dashed ? '..>' : '->',
      flags: new Set((['skip', 'curve', 'thick', 'dashed', 'crossed'] as const).filter(k => s[k])),
      attrs: { ...(s.side && { side: s.side }), ...(s.color && { color: s.color }) },
    }))
    return {
      dir: this.options.flow ?? 'TB', theme: this.options.theme ?? 'light', gap: this.options.gap,
      nodes, edges, groups: [...g.groups.values()].map(x => ({ ...x, flags: new Set(x.flags) })), ranks: g.ranks.map(rs => rs.map(r => g.id(r))),
    }
  }
  /** Render to an SVG string (works without a DOM). */
  svg(options: { theme?: 'light' | 'dark' } = {}): string {
    return render(layout(this.diagram()), options.theme ?? this.options.theme, this.options.materials ?? true)
  }
  /** Render into an element (or a CSS selector). */
  mount(target: string | Element, options: { theme?: 'light' | 'dark' } = {}): this {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) throw new Error(`mount: no element matches "${target}"`)
    el.innerHTML = this.svg(options)
    return this
  }
}

/** Build a figure in one block: figure({ flow: 'BT' }, fig => { ... }) */
export function figure(options: FigureOptions, build: (fig: Figure) => unknown): Figure {
  const f = new Figure(options)
  build(f)
  return f
}
