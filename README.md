# machine-mermaid

A mermaid-style DSL built for ML architecture diagrams. Zero dependencies, ~16 KB gzipped, outputs SVG strings (it also works in SSR or Node).

- **Layout**: a grid of ranks and lanes. Chains are always straight, edges are orthogonal with rounded corners, and residuals automatically detour around obstacles. No wiggly curves.
- **ML presets**: `mha` `ffn` `norm` `embed` `linear` `softmax` `conv` `tensor` `stack` `neurons` `enc` `dec` `op "+"` and more
- **Materials**: 🧊 / `frozen` → clear ice (bevel, specular, cracks, frost ferns). 🔥 / `train` → magma (cracked crust and molten veins). These use the WebGL shaders from [portfolio](https://github.com/frinfo702/portfolio), run once per block size and baked into a still image embedded in the SVG. Identical sizes share one image. Without WebGL (SSR or Node), it falls back to a lightweight vector look (frost texture, snow, ❄ badge), and `{ materials: false }` forces that fallback.
- **LaTeX**: write `$\mathbf{x}_{t-1}$` or `$p_\theta(\cdot)$` directly. A built-in mini TeX engine handles it without KaTeX.

```html
<pre class="machine-mermaid">
flow BT
q text "$Q$"
k text "$K$"
mm matmul
sm softmax
q, k -> mm -> sm
</pre>
<script type="module">
  import mm from './dist/machine-mermaid.js'
  mm.run()                        // renders every .machine-mermaid
  // const svg = mm.render(src, { theme: 'dark' })   // returns a string
</script>
```

Run `bun run build` to get `dist/machine-mermaid.js` (ESM) and `dist/machine-mermaid.iife.js`. Demo (paper figure gallery and playground): https://frinfo702.github.io/machine-mermaid/demo/. To view it locally, run `bun run build && python3 -m http.server` and open `demo/`. Pushing to `main` deploys it automatically through GitHub Pages (`.github/workflows/pages.yml`).

## Syntax

```
flow TB | BT | LR | RL          # flow direction
theme light | dark
gap 30 44                        # gap along the flow / across it

id  preset "label" color flags key=value
a -> b -> c                      # chains
q, k -> mm                       # fan-in / fan-out
a -> "label" b                   # edge label (or put it at the end of the line)
a ..> b curve                    # dashed, curved
style a, b frozen color=#ff8800  # apply attributes to existing nodes later

group enc "Encoder" repeat="N×" frozen {
  ...                            # nodes defined or listed here belong to the group
}
rank a b c                       # force the same rank
```

| Edge | Meaning |
|---|---|
| `->` `-->` | arrow |
| `..>` | dashed arrow |
| `--` `..` | line with no arrowhead |
| `=>` | thick arrow. Between two `neurons` nodes it draws a fully connected layer |
| `<->` | bidirectional |

Edge flags: `skip` (forces a detour) `curve` `dashed` `thick` `side=left|right|top|bottom` `color=`

**Shapes**: `block` `thin` `op` (`"+"` ⊕, `"*"` ⊗, `"~"` positional encoding) `var` (circle) `tensor size=W,H,D` `stack n=4 size=W,H offset=7` `enc` `dec` `neurons n=4` `vector "0.2,0.7,0.1"` `image src=...` `text`

**Presets** (shape + color + default label): `mha` `attn` `ffn` `mlp` `norm` `embed` `linear` `softmax` `matmul` `concat` `conv` `pool` `act` `dropout` `loss`

**Colors**: `pink orange yellow green blue purple teal red gray white` or `#hex`

**Flags**: `frozen` (also 🧊 / ❄️) `train` (also 🔥) `dashed` `bold`. Attributes: `ghost=3` (stacked copies, e.g. multi-head) `caption=` `w=` `h=`

**Placement**:
- Automatic: the rank is the longest path. The lane is inherited from the first predecessor. When several predecessors on the same rank merge, the node goes in the middle.
- `lane=1.5` sets the lane explicitly (fractions allowed). `align=id` puts the node in the same lane as `id`.
- `left-of=id` `right-of=id` `above=id` `below=id` (`dist=22`) place a node next to another.
- `at=x,y` sets absolute coordinates. `nudge=dx,dy` makes small adjustments.

**Labels**: `\\` or `<br>` for line breaks. `$...$` is math. Supported: `^ _ \mathbf \mathrm \text \boldsymbol \mathcal \mathbb`, Greek letters, common symbols, `\hat \tilde \bar \vec`, `\frac` (rendered as a/b).

## Design

- Layout: ranks plus lanes in O(V+E), then routing edges (straight → Z bend → detour). It averages about 0.13 ms per diagram in the gallery examples.
- Materials: one WebGL context is shared, and output is cached per (material, size). Each image is roughly 20–50 KB as WebP (PNG on Safari).
- Text is measured with canvas `measureText` (cached). Without a DOM, a width-table approximation is used.
- Known limits: crossings are not minimized (declaration order decides the result). TeX is a subset, with no fraction stacking and no matrices. Edge labels are not checked for collisions with nodes.
