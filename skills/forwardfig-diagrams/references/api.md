# forwardfig API reference

Everything is a named export of `forwardfig` (`npm install forwardfig`). Output
is SVG; it works in the browser and in Node.

Contents: Objects · Figure · Blocks · Block options · Placement · Edges ·
Modules · Styling · Data blocks · Labels and math · Export and CLI

## Objects

| Object | Role | Analogy |
| --- | --- | --- |
| `Layer` | One block. `layer(x, y)` draws edges from `x`, `y` into it and returns a `Tensor`. Calling the same layer again adds edges into the **same** block. | `nn.Linear` |
| `Module` | Subclass with `forward(...)`. Instances are callable. `label` / `repeat` / `box` draw a group box. | `nn.Module` |
| `Tensor` | The value flowing between blocks. `x.edge(...)` styles the next edge it enters; `x` itself is unchanged. | KerasTensor |
| `Figure` | The drawing side: inputs, extra edges, ranks, rendering. | `plt.figure` |

## Figure

```ts
const fig = new Figure({ flow: 'BT' })          // or figure({ flow: 'LR' }, fig => { ... })
const x = fig.input('$\\mathbf{x}$')            // a text input
const img = fig.input(image(src, 'Image'))      // a layer as input
const pe = fig.input(op('~', { leftOf: sum }))  // a layer input with extra options
```

| Member | Notes |
| --- | --- |
| `new Figure(options?)` | `flow: 'TB' \| 'BT' \| 'LR' \| 'RL'` (default `'TB'`), `gap: [along, across]` px, `theme: 'light' \| 'dark'`, `legend: true \| { position: 'right', labels: {...} }`, `style`, `kinds`, `materials: false` |
| `figure(build)` / `figure(options, build)` | Builds and returns a Figure from a callback. |
| `fig.input(label \| layer = '', options?)` → `Tensor` | A starting point. With a layer, `options` are merged into it. |
| `fig.edge(from: Tensor, to: Tensor \| Layer, edgeOptions?)` | An edge outside the dataflow (feedback, reverse process). |
| `fig.rank(...refs)` | Puts blocks on the same rank (row in TB/BT, column in LR/RL). |
| `fig.svg({ theme? })` → string | Works without a DOM. |
| `fig.mount(el \| selector)` | Browser. |
| `fig.download(name, opts?)`, `fig.toBlob(opts)` | Browser raster/SVG export. |

## Blocks

Every factory takes `(label?, options?)` or `(options?)`; `image(src, …)` and
`vector(values, …)` take their data first.

| Factory | Draws |
| --- | --- |
| `block` | Rounded block |
| `thin` | Flat block (norms, activations, small ops) |
| `text` | Label without a box (figure inputs/outputs) |
| `empty` | Empty space; an edge starts or ends in the void |
| `circle` | A variable |
| `op('+' \| '*' \| '~' \| short)` | ⊕ ⊗ ∼ or any short symbol in a circle. Takes options (`lane`, `leftOf`…) |
| `enc` / `dec` | Trapezoid that narrows / widens along the flow |
| `tensor` | 3D box, `size: [w, h, depth]` |
| `stack` | Stacked feature maps, `n`, `size: [w, h]`, `offset` |
| `neurons` | Column of units, `n`; join two with `x.edge({ dense: true })` |
| `vector(values, label?)` | Row of values |
| `add(...xs)`, `mul(...xs)` | A **new** ⊕ / ⊗ on every call; takes tensors only, no options |

ML presets (default label / color / shape): `mha` Multi-Head Attention /
orange / block · `attention` orange block · `ffn` Feed Forward / blue / block ·
`mlp` blue block · `norm` Add & Norm / yellow / thin · `embed` Embedding /
pink / block · `linear` purple thin · `softmax` green thin · `matmul` purple
thin · `concat` yellow thin · `conv` teal block · `pool` gray thin · `act`
ReLU / green / thin · `dropout` gray thin · `loss` red block.

Custom presets: `const rmsnorm = preset('thin', 'RMSNorm', 'yellow')`,
`preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })`. Call as
`rmsnorm()(x)` or `rmsnorm('Pre-Norm', { color: 'blue' })(x)`.

## Block options

| Option | What it does |
| --- | --- |
| `color` | `pink orange yellow green blue purple teal red gray white`, `#hex`, any CSS color. Default neutral grey. |
| `texture` | `ice magma glass metal noise quantized sparse hatch` |
| `frozen` / `trainable` | Ice / magma with a ❄ / 🔥 badge. Same as `.freeze()` / `.trainable()` |
| `crossed` | Dims the block and lays a red ✕ over it (ablated) |
| `dashed`, `bold` | Outline style |
| `w`, `h` | Fixed size in px |
| `ghost` | Stacked copies behind the block (heads, experts) |
| `caption` | Small text under the block |
| `fontSize`, `fontFamily` | Label font |
| `id` | Stable unique id |

`.freeze()` / `.trainable()` exist on layers and modules (a module applies it
to every block inside). A 🧊 / 🔥 in a label does the same.

## Placement

Automatic by default: rank = longest path from an input; lane = the lane of
the block's first unclaimed input, so chains are straight. A ⊕ fed by several
inputs on one rank sits between them. Lanes are reordered greedily to reduce
crossings (a `lane` you set never moves).

| Option (on a block) | What it does |
| --- | --- |
| `lane: n` | Cross-axis column. Fractions sit between columns (`1.5`) |
| `align: ref` | Same column as `ref` |
| `leftOf` / `rightOf` / `above` / `below: ref` | Next to `ref`, `dist` px apart (default 22). Removed from the grid |
| `at: [x, y]` | Absolute position |
| `nudge: [dx, dy]` | Shift after layout |

`ref` is a layer or a tensor; a layer can be referenced before it is called.

## Edges

Style with `x.edge({...})` before the call, or `fig.edge(from, to, {...})`. A
string is a label: `x.edge('$r$')`.

| Option | What it does |
| --- | --- |
| `label` | Text beside the edge (TeX ok) |
| `dashed`, `thick`, `color` | Line style |
| `arrow` | `'end'` (default), `'both'`, `'none'` |
| `crossed` | ✕ in the middle: a cut connection |
| `curve` | Curved instead of orthogonal |
| `skip` | Force a detour around blocks (residuals get it automatically) |
| `side` | Where a detour runs: `left`/`right` in TB/BT, `top`/`bottom` in LR/RL |
| `join: 'side'` | Comes down the source's line and turns into the target's side (L). For conditioning taps |
| `dense` | All-to-all lines between two `neurons` |

Routing: when several arrows enter one block, the dead-straight one stays and
the others bend; on a small ⊕ they join from the side. Edges against the flow
are drawn straight / L / Z when clear, otherwise as a U.

## Modules

```ts
class Block extends Module {
  attn = mha(); n1 = norm(); ff = ffn(); n2 = norm()   // fields are the module's blocks
  forward(x: Tensor) {
    const h = this.n1(this.attn(x), x)                 // residual: just pass x again
    return this.n2(this.ff(h), h)
  }
}
const y = new Block({ repeat: 'N×' })(x)
```

`new Module(options)`: `label` (titled box), `repeat` (e.g. `'N×'`),
`repeatSide: 'auto' | 'top' | 'bottom' | 'left' | 'right'`, `box: true`,
`color`, `dashed`, `texture`, `frozen`, `trainable`, `style`, `kinds`, `id`.
`forward` may take several tensors and return a tensor, array or object.
Arrays of layers as fields work (`experts = [0,1,2].map(i => ffn(...))`).

## Styling

Scoped defaults like matplotlib's rcParams, strongest first: block's own
options › inner module › outer module › figure › `configure()` › preset.

```ts
configure({ style: { fontSize: 14 }, kinds: { mha: { color: 'purple' } } })   // library-wide
new Figure({ style: { fontFamily: 'Times New Roman, serif' } })                // this figure
new Encoder({ style: { texture: 'glass' } })                                   // blocks in this module
configure(null)                                                                // reset
```

`style` keys: `color texture fontSize fontFamily dashed bold`. `kinds[kind]`
beats `style` at the same level. `legend: true` keys every look actually used
(frozen, trainable, textures, crossed).

## Data blocks

Labels sit above these. Keep them small so they don't dominate.

| Factory | Key options |
| --- | --- |
| `image(src \| src[], label?, opts)` | `size: [w, h]`, `fit`, `grid` (ViT patches), `n` (batch), `tilt`, `rotate`. `src`: URL, data URL, `<img>`, `<canvas>` (Node: http(s) or data URL only) |
| `magnify(label?, { patch: [col, row] \| region: [x, y, w, h], lens: 'circle' \| 'square', size })(img)` | Zoom on part of an image; output feeds on |
| `matrix(label?, { rows, cols, cells, cellSize, axes: { rows, cols } })` | Cell: 0–1 shade, color string, or `{ value, color, texture, label, crossed }`; `cells` may be `(r, c) => cell` |
| `voxels(label?, { rows, cols, depth, cells, cellSize, axes })` | 3D grid |
| `gaussian`, `space`, `sphere`, `pointcloud` | `peaks` / `points: [[x, y, z, class?]]` in [-1, 1]; `pointcloud({ shape: 'torus' })` |
| `waveform(label?, { samples })` | Audio in [-1, 1] |
| `plot(fn, label?, { x, y, axes, size, points, legend })` | y = fn(x); `points: [{ at, marker, label }]` |

## Labels and math

`\n` starts a new line. `$...$` is TeX; in TS strings escape backslashes:
`'$\\mathbf{x}_t$'`. Without MathJax a built-in engine covers `^ _ \mathbf
\mathrm \text \boldsymbol \mathcal \mathbb`, Greek, common symbols, `\hat
\tilde \bar \vec`, `\frac` (as a/b).

## Export and CLI

```sh
npx forwardfig fig.ts -o fig.svg    # default export: a Figure or a function returning one
npx forwardfig fig.ts -o fig.png    # png/jpg/webp need sharp: npm i -D sharp
npx forwardfig figs.ts -o out/      # no default export: each exported Figure → out/<name>.svg
```

Options: `--theme light|dark`, `--scale` (default 2), `--background`. `.ts`
needs Node ≥ 22.6 (`NODE_OPTIONS=--experimental-strip-types` before 23.6) or
Bun; or write `.mjs`. In Node, WebGL textures (ice, magma, glass, metal,
noise) use their vector fallback. PDF is not supported; convert the SVG.
