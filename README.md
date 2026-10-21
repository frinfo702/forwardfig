# machine-mermaid

Draw ML architecture figures in TypeScript, written the way you write the model. It has zero dependencies, is about 19 KB gzipped, and outputs SVG (it also works in Node).

Demo (paper figure gallery and playground): https://frinfo702.github.io/machine-mermaid/demo/

```ts
import { Figure, Module, Tensor, mha, norm, ffn, text } from 'machine-mermaid'

class EncoderLayer extends Module {        // like nn.Module
  attn = mha()
  n1 = norm()
  ff = ffn()
  n2 = norm()
  forward(x: Tensor) {
    const h = this.n1(this.attn(x), x)     // Add & Norm with a residual
    return this.n2(this.ff(h), h)
  }
}

const fig = new Figure({ flow: 'BT' })      // drawing side, like matplotlib
const y = new EncoderLayer({ repeat: 'N×' }).freeze()(fig.input('$\\mathbf{x}$'))
text('$\\mathbf{h}$')(y)
fig.mount('#figure')                        // or fig.svg() for a string
```

## Model

| | Role | Analogy |
|---|---|---|
| `Layer` | One block (one node). Calling it as `layer(x, y)` draws edges into it and returns a Tensor. Calling the same layer again adds edges to the same node, so shared weights stay one block. | `nn.Linear` / `keras.layers.Dense` |
| `Module` | A subclass that implements `forward()`. Instances are callable. Pass `label` / `repeat` / `box` to draw a group box. `repeatSide: 'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` sets where `repeat` (e.g. ×N) goes. `auto` (the default) picks the first spot that doesn't collide with blocks, edges, labels or other groups. | `nn.Module` |
| `Tensor` | The value flowing between blocks. `x.edge('$r$')` and `x.edge({ dashed: true })` style the next edge it enters. | KerasTensor |
| `Figure` | The drawing side: `input()`, `edge()` (edges outside forward), `rank()`, `svg()` / `mount()`. | `plt.figure` |

There are two ways to write a figure. Use whichever suits the figure, or mix them.

- **All in the figure**: `figure({ flow: 'LR' }, fig => { ... })` builds everything in one place.
- **By module**: define each `Module` alongside your model code, then call them in the figure.

```ts
// functional style
const fig = new Figure({ flow: 'BT' })
const x = fig.input('$\\mathbf{x}$')
const W = block('Pretrained $W$').freeze()               // 🧊
const A = thin('$A$').train(), B = thin('$B$').train()   // 🔥
add(W(x), B(A(x).edge('$r$')))
```

## Layers

All layers take `(label?, options?)` or `(options?)`.

- Basic: `block` `thin` `text` `circle` `op('+' | '*' | '~')` `enc` `dec` `tensor({ size: [w,h,d] })` `stack({ n, size, offset })` `neurons({ n })` `vector(values)`
- ML presets: `mha` `attention` `ffn` `mlp` `norm` `embed` `linear` `softmax` `matmul` `concat` `conv` `pool` `act` `dropout` `loss`
- Functional: `add(...xs)` (⊕) and `mul(...xs)` (⊗) create a new node on each call.
- Grids: `matrix({ rows, cols, cells, cell })` (2D) and `voxels({ rows, cols, depth, cells, cell })` (3D, the front, top and right faces as cells). `cells` is a 2D array or `(r, c) => cell` (`(r, c, d) => cell` for voxels, with d = 0 in front). A cell is a number in 0–1 (a shade of the block's colour), a colour string, or `{ value | color, texture, label, crossed }`. When `cells` is omitted, varied shades are used. Textures inside cells use the lightweight vector looks. `axes: { rows, cols, depth }` names the extent along each axis (TeX works). `cols` goes under the bottom edge, `rows` to the left and `depth` beside the receding edge; any that would sit on an arrow are moved off its line.
- Magnify: `magnify({ patch: [col, row] | region: [x, y, w, h], lens: 'circle' | 'square' })(img)`. Enlarges part of the image it's called on with a magnifying glass (`circle`, the default) or an inset (`square`). `patch` is one cell of the source's `grid`, and `region` is a range given as 0–1 fractions. It draws the range's outline and zoom lines instead of an arrow, and the enlarged part can feed the next block (e.g. Linear Projection). The lens shows the source range cropped by default; `src` (URL, `<img>`, `<canvas>`, with `fit`) puts any other image in it, such as a high-resolution crop.
- 3D:
  - `gaussian({ peaks: [[x, y, amp?, sigma?]], mesh })`: a Gaussian or mixture surface.
  - `space({ points: [[x, y, z, class?]], axes })`: a 3D scatter on axis panes.
  - `sphere({ points })`: points on a hypersphere.
  - `pointcloud({ points: [[x, y, z, class?]], shape: 'torus' | 'sphere' | 'cube', n })`: a point cloud. Closer points are drawn larger and darker. When `points` is omitted, they're sampled from `shape`.
- Signals: `waveform({ samples })`. `samples` takes raw audio in [-1, 1] (`number[]` or `Float32Array`). Long signals are reduced to at most 256 min/max columns, so the SVG stays light. When omitted, a synthetic speech-like waveform is drawn.
- Images: `image(src, label?, { size, fit: 'cover' | 'contain', grid, n, tilt, rotate })`. `src` can be a URL, a data URL, an `<img>` or a `<canvas>`. Passing an array (`image([t0, t1, t2])`) draws a stack of frames, each its own image, with the first one in front. `grid` draws a ViT-style patch grid, and `n` draws a batch of frames. `tilt` (degrees) turns the image around its vertical axis and draws it obliquely; a positive value sends the right edge back (up), a negative one the left; combined with `n`, it reads as a video volume. `rotate` (degrees) rotates it in-plane. The layout uses the transformed frame's bounding box.

Common options: `color` `texture` `frozen` `train` `crossed` `dashed` `bold` `w` `h` `ghost` `caption` `id`

- `color`: a palette name (`pink orange yellow green blue purple teal red gray white`) or `#hex`. If it's omitted, the block is a neutral grey that reads on both light and dark pages.
- `crossed: true` dims the block and lays a red ✕ over it, for removed or ablated parts. On an edge it puts a ✕ in the middle, for a cut connection.
- `texture` sets a block's surface. Set it on a module to style its group box.

  | texture | Look | Example use |
  |---|---|---|
  | `ice` | Clear ice (WebGL) | Frozen weights. This is what `freeze()` gives |
  | `magma` | Cracked magma (WebGL) | Trainable weights. This is what `train()` gives |
  | `glass` | Frosted glass that keeps the block's colour (WebGL) | Soft prompts, adapters |
  | `metal` | Brushed metal (WebGL) | Fixed ops, hardware |
  | `noise` | Gaussian grain (WebGL) | Noise injection, diffusion |
  | `quantized` | A 4-level mosaic of the block's colour (SVG) | Low-bit weights |
  | `sparse` | A dot grid with gaps (SVG) | Pruning, sparsity |
  | `hatch` | Diagonal lines (SVG) | Masked, stop-gradient |

  When both are set, `texture` decides the surface, and the ❄/🔥 badge follows `freeze()` / `train()` (for example `block({ texture: 'quantized' }).freeze()` in QLoRA). Without WebGL, glass, metal and noise fall back to lightweight vector versions.

- Placement is automatic by default. To override it, use `lane` (fractions allowed), `align: ref`, `leftOf` / `rightOf` / `above` / `below: ref` (with `dist`), `at: [x, y]` or `nudge: [dx, dy]`.
- `freeze()` / `train()` can be called on a layer or on a module. On a module they apply to every block inside it, unless a layer is marked explicitly.
- A 🧊 or 🔥 in a label works the same way.

Edges (`x.edge({...})` / `fig.edge(a, b, {...})`): `label` `crossed` `join: 'side'` (comes down the source's line and turns into the target's side, an L; for conditioning taps. It doesn't affect column assignment) `dashed` `arrow: 'end' | 'both' | 'none'` `thick` `dense` (fully connected between `neurons`) `skip` `curve` `side` `color`

Labels: a newline (`\n`) starts a new line, and `$...$` is TeX.

- **When the page loads MathJax 3**, math is typeset by it automatically. It's embedded in the SVG as paths drawn with real TeX metrics and glyphs. Use `tex-svg-full.js`, because the other builds load some extensions asynchronously.

  ```html
  <script>window.MathJax = { startup: { typeset: false }, svg: { fontCache: 'local' } }</script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg-full.js"></script>
  <script type="module">await MathJax.startup.promise; /* draw figures */</script>
  ```

- **In Node, or with any other engine**, pass a function that returns an `<svg viewBox>` (1000 units per em) via `configure({ tex: src => ... })`. With `mathjax-full`, `tex: t => adaptor.outerHTML(html.convert(t, { display: false }))` works.
- **Without MathJax**, a built-in lightweight engine handles it. It covers `^ _ \mathbf \mathrm \text \boldsymbol \mathcal \mathbb`, Greek letters, common symbols, `\hat \tilde \bar \vec` and `\frac` (rendered as a/b), with TeX-like spacing. Force it with `configure({ tex: null })`.

## Custom presets

The built-in presets (`mha`, `norm` and so on) are just a shape plus a default label and colour. You can define your own the same way.

```ts
const rmsnorm = preset('thin', 'RMSNorm', 'yellow')
const moe = preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })
rmsnorm()(x)                       // default label and colour
rmsnorm('Pre-Norm', { color: 'blue' })(x)  // override them
```

`kind` is the key that `kinds` (below) matches on. It defaults to the shape name.

## Style config

Like matplotlib's rcParams, you can set defaults globally and narrow them down by scope. A narrower scope always wins, so a value applies unless a lower level sets its own.

```ts
configure({ style: { fontSize: 14 }, kinds: { mha: { color: 'purple' } } })  // whole library
new Figure({ style: { color: 'gray' } })                                    // this figure
new Encoder({ style: { fontSize: 11, texture: 'glass' } })                  // blocks made inside this module
block('x', { fontSize: 20 })                                                // the block itself wins
configure(null)                                                             // reset
```

- Precedence, strongest first: the block's own options > inner Module > outer Module > Figure > `configure()` > the preset's defaults.
- At each level, `kinds[kind]` (for one preset) beats `style` (for all blocks).
- `style` can set `color` `texture` `fontSize` `dashed` `bold`. At the Figure / `configure` level, `fontSize` also sizes edge labels, group titles and captions.
- A `texture` set through style doesn't override `freeze()` / `train()` (ice and magma win). A texture set on the block itself does.
- `configure` also takes `theme` `flow` `gap` `materials`.

## Export

```ts
await fig.download('figure.png')                 // the format follows the extension: .svg .png .jpg/.jpeg .webp
await fig.download('figure.png', { scale: 3 })   // raster resolution
const blob = await fig.toBlob({ format: 'webp', quality: 0.9, background: '#fff', theme: 'dark' })
fig.svg()                                        // string (works in Node too)
```

- Raster formats (png / jpeg / webp) need a browser (canvas). External image URLs inside are inlined as data URLs before export. JPEG gets a white background by default.
- PDF isn't supported. For papers, an SVG export (vector) can go into LaTeX via Inkscape or `svg2pdf`.

## Drawing core

The layout and rendering engine is independent of the API above. `fig.diagram()` returns plain `Diagram` data (nodes, edges, groups, ranks), which `draw(diagram, { theme })` turns into SVG. Anything that can generate a Diagram, from another language or as JSON, can reuse the same engine.

- Layout: a grid of ranks (longest path) and lanes (a block inherits its first input's lane), so chains are always straight. Edges against the flow (e.g. a column that goes back up, aligned with `fig.rank`) are drawn straight, as an L or as a Z when the path is clear. A block whose only inputs come against the flow inherits the lane of the block it feeds. Edges are orthogonal: straight, one Z bend, or a detour. When several arrows enter one block, the one that goes dead straight never moves, and on a small ⊕ the others join from the side.
- Materials: 🧊 / 🔥 run the WebGL shaders from [portfolio](https://github.com/frinfo702/portfolio) once per block size and embed the result as an image. Without WebGL it falls back to a vector look, and `new Figure({ materials: false })` forces that fallback.
- Text is measured with canvas `measureText` (cached). Without a DOM, a width-table approximation is used.

To develop locally: run `bun install && bun test && bun run build`, then `python3 -m http.server` and open `demo/`. Pushing to `main` deploys the demo to GitHub Pages.

Known limits: crossings are not minimized (declaration order decides the result). TeX is a subset. Edge labels are not checked for collisions.
