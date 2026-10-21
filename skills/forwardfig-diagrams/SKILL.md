---
name: forwardfig-diagrams
description: How to draw clean, readable ML architecture figures with forwardfig (TypeScript, SVG out) and get the layout you intended — structure the code like the model, steer the automatic layout with lanes/ranks instead of coordinates, and verify by rendering to PNG and looking. Use this whenever you write or edit code that imports `forwardfig`, when asked to draw a model / network / architecture / paper figure (Transformer, ViT, U-Net, LoRA, VAE, diffusion, MoE, ...) in a project that uses forwardfig, or when a forwardfig figure looks cluttered, has crossing or detouring arrows, misplaced blocks, or overlapping labels.
---

# Drawing architecture figures with forwardfig

forwardfig traces a figure the way PyTorch traces a model: you call layers on
tensors, and each call records a block plus the edges into it. Layout is
automatic (ranks along the flow, lanes across it, orthogonal edges). Good
figures come from three habits:

1. **Write the figure as the model's dataflow**, so the automatic layout has
   the right graph to work with.
2. **Steer with relative hints** (`lane`, `fig.rank`, `leftOf`/`below`, `side`)
   only where the default is wrong — never by pixel coordinates first.
3. **Render and look.** You cannot judge a layout from code. Render a PNG,
   view it, fix one thing, repeat.

**Before writing any figure code, read `references/api.md`.** forwardfig is
young and almost certainly not in your training data, so guessing names from
similar libraries (graphviz, matplotlib, torchview) produces code that doesn't
compile. The reference lists every factory, option and edge style.
`references/recipes.md` has seven paper figures (Transformer, MoE, ViT, U-Net,
DDPM, LoRA, LLaVA), each annotated with the layout technique it shows; skim
it when your figure has parallel branches, side inputs or a known shape.

If the API reference doesn't answer a question, the installed package has
typings at `node_modules/forwardfig/dist/api.d.ts` and the online docs are at
https://frinfo702.github.io/forwardfig/docs/.

## The render–look–fix loop

Put the figure in a `.ts` file whose default export is the `Figure`:

```ts
// fig.ts
import { Figure, linear, act, softmax, text } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const h = act()(linear()(fig.input('$\\mathbf{x}$')))
text('$\\hat{y}$')(softmax()(h))
export default fig
```

```sh
npm i forwardfig && npm i -D sharp  # sharp is only for PNG output
npx forwardfig fig.ts -o fig.png    # .ts needs Node ≥ 22.6 or Bun; .mjs works everywhere
```

(Inside the forwardfig repo itself: `bun install && bun run build`, import from
`src/index`, run `bun dist/cli.js fig.ts -o fig.png`.) Then open the PNG with
your image-reading tool and check:

- Does the main path run in one straight line?
- Do any arrows cross, or take a long detour around blocks?
- Are side inputs (positional encoding, noise, conditioning) next to where they
  enter, not floating in their own column?
- Is every label readable, not overlapping an arrow or another label?
- Does each group box contain exactly what it should, and is `N×` placed well?

Fix the single worst problem, re-render, look again. Changing several hints at
once makes it hard to tell which one helped.

## 1. Structure the code like the model

The layout engine assigns ranks by longest path and gives each block **the lane
of its first input**. So the order and identity of calls is the layout.

- **One layer instance = one block.** Calling the same instance twice adds edges
  into the same node (shared weights, Siamese encoders). If you want two
  separate "Add & Norm" boxes, create two: `n1 = norm(); n2 = norm()`. Reusing
  one by accident produces a single block with tangled edges.
- **`add(...)` / `mul(...)` are the exception**: they make a new ⊕/⊗ per call.
- **Write residuals naturally and let the engine route them.** `norm()(this.attn(x), x)`
  is all a residual needs: the straight input stays put and the skip is drawn
  as a detour. Don't add `skip`, `side` or lanes until a render shows a problem.
- **`norm()` is post-LN "Add & Norm"**: `norm()(sublayer(x), x)` draws one
  block that adds and normalizes. For pre-LN (GPT-2, LLaMA) draw the norm
  before the sublayer and the residual as a separate ⊕:
  `add(this.attn(this.ln1(x)), x)`, where `ln1 = layerNorm()` and
  `const layerNorm = preset('thin', 'LayerNorm', 'yellow')`.
- **When branches merge, the first argument's lane tends to win** (a block
  takes the lane of its first unclaimed input). If a merge block lands in the
  wrong column, reorder its arguments before adding `lane`.
- **Use a `Module` for every box you'd draw in the paper.** `label` gives a
  titled group, `repeat: 'N×'` the stack count, `box: true` an untitled box.
  Modules also scope `style` and `freeze()` / `trainable()`.
- **Return several tensors from `forward()`** (array or object) when a module
  has several outputs (μ and σ, Q/K/V). No need to flatten everything into one
  function.
- **Pick `flow` to match the paper.** Transformers and LoRA usually read
  bottom-to-top (`'BT'`); CNN pipelines, encoders/decoders, diffusion chains
  read left-to-right (`'LR'`). Long chains in LR get very wide — consider `'TB'`
  / `'BT'` for more than ~7 blocks in a row.

## 2. Steer the layout, lightest hint first

Reach for these in order; stop at the first one that fixes the picture.

| Problem in the render | Fix |
| --- | --- |
| Blocks too cramped / too loose | `new Figure({ gap: [along, across] })` |
| Parallel branches in the wrong order or crossing | `lane: n` on the branch blocks (fractions sit between: a router over 4 experts at `lane: 1.5`) |
| A merge block should sit centered under its branches | `lane` with a fraction on it (`lane: 0.5` between lanes 0 and 1) |
| Two parallel chains (frozen path + trainable copy) swap sides or drift into a staircase | Give every block in both chains a `lane`, and pair blocks across chains with `fig.rank`. `add()` / `mul()` take no options, so their ⊕ has no fixed lane and lane reordering can still flip the sides: use `op('+', { lane })` instead and call it like a layer |
| Two blocks should line up across the flow (e.g. Hv and Hq tokens) | `fig.rank(a, b)` |
| Two blocks should share a column | `align: ref` |
| A side input sits in its own column far away | Put it beside its consumer: `fig.input(op('~', { leftOf: sum }))`, `{ below: sum }`, `{ above: sum }` (`dist` for spacing). Note you can reference a layer before calling it. |
| A residual / skip detour runs on the wrong side | `x.edge({ side: 'left' })` (TB/BT) or `{ side: 'top' }` (LR/RL) |
| A conditioning tap should enter from the side as an L | `x.edge({ join: 'side' })` |
| A feedback / reverse edge (diffusion q, flow inverse) | `fig.edge(from, to, { dashed: true, curve: true, label })` |
| Still off by a few px | `nudge: [dx, dy]` |
| Nothing else works | `at: [x, y]` (last resort; it opts the block out of the grid) |

Why this order: the grid keeps chains straight and edges orthogonal for free.
Every hint that removes a block from the grid (`leftOf`, `at`) gives that up
for that block, so use them for leaf decorations, not the main path.

## 3. Make it read like a paper figure

- **Color by role, not by block.** Use the presets (`mha` orange, `ffn` blue,
  `norm` yellow, …) so the same kind of block looks the same everywhere. Two
  to four colors in one figure is plenty; leave plumbing blocks neutral grey.
  Recolor a kind globally with `new Figure({ kinds: { mha: { color: 'purple' } } })`
  rather than per block.
- **Say what a block *is* with texture, not words.** `freeze()` / `trainable()`
  for frozen vs. trained weights (🧊/🔥), `texture: 'quantized'` for low-bit,
  `'hatch'` for masked / stop-gradient, `crossed: true` for ablated parts. Add
  `legend: true` so the reader gets the key. `freeze()` on a module applies to
  all blocks inside.
- **Short labels, math for symbols.** Break long names with `\n`
  (`'Patch\nEmbedding'`) instead of widening the block. Use `$...$` TeX for
  variables, and remember to escape backslashes in TS strings: `'$\\mathbf{x}$'`.
  Mixing words and math in one line (`'Input tokens $x_{1:T}$'`) can leave an
  uneven gap; put the math on its own line (`'Input tokens\n$x_{1:T}$'`) or
  keep the label to one or the other.
- **Label tensors on edges, not with extra blocks.** `x.edge('$r$')`,
  `x.edge('masked')`. Use `text('...')` blocks only for figure inputs/outputs.
- **Show data instead of naming it** when it helps the story: `image`,
  `vector`, `matrix`, `voxels`, `waveform`, `pointcloud`, `plot`. Keep them
  small (`size`, `cellSize`) so they don't dominate the architecture.
- **Use `ghost: 3`** for "multiple heads / experts / repeated copies" instead of
  drawing three blocks.
- **Match the paper's font** with `new Figure({ style: { fontFamily: 'Times New Roman, serif' } })`.

## 4. Define your own building blocks

When a paper uses a block type repeatedly, make a preset once so labels and
colors stay consistent:

```ts
const rmsnorm = preset('thin', 'RMSNorm', 'yellow')
const moe = preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })
```

For a repeated sub-structure (a ⊕ with a ~ beside it, a resolution level in a
U-Net), write a small helper function that takes `fig` and a tensor and returns
a tensor. See `references/recipes.md` for examples.

## Common mistakes

- Expecting two blocks from one reused layer instance (see §1).
- Forgetting `export default fig` (or exporting a function that returns it) —
  the CLI exits with "exports no Figure".
- Single backslashes in TeX inside TS strings: `'$\mathbf{x}$'` silently loses
  the backslash. Use `'$\\mathbf{x}$'` or a `String.raw` template.
- Reaching for `at: [x, y]` first. It freezes one block while everything else
  keeps moving, so the figure breaks again as soon as you add a block.
- Judging the layout from the code without rendering.
- Using the PNG export from Node and expecting WebGL textures (ice / magma /
  glass…): Node draws the vector fallback. That's expected, not a bug.
- PDF output: not supported. Export SVG and convert (Inkscape, `svg2pdf`).
