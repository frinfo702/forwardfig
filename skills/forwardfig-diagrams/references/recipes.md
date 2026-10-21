# Recipes: paper figures and the technique each one shows

These come from the demo gallery (https://frinfo702.github.io/forwardfig/demo/,
23 figures in all, including CNNs, VAE, GAN, CLIP, QLoRA, PointNet, wav2vec,
AlexNet and causal attention). Each snippet assumes the needed names are
imported from `'forwardfig'` and ends with the figure built; in a file for the
CLI, add `export default fig`. `src` stands for an image URL or data URL.

Contents: Transformer · Mixture of Experts · ViT · U-Net · DDPM · LoRA · LLaVA ·
PixDiT, compact · MM-DiT, folded

## Transformer — modules, repeat, side inputs placed by reference

Shows: one `Module` per paper box with `repeat: 'N×'`; residuals written as a
second argument and routed automatically; a reusable helper that places the
positional-encoding `~` beside its ⊕ with `leftOf` / `rightOf`, so it doesn't
get its own column; two inputs (`x`, `memory`) into a module.

```ts
class EncoderLayer extends Module {
  attn = mha()
  n1 = norm()
  ff = ffn()
  n2 = norm()
  forward(x) {
    const h = this.n1(this.attn(x), x)
    return this.n2(this.ff(h), h)
  }
}

class DecoderLayer extends Module {
  self = mha('Masked\nMulti-Head Attention')
  n1 = norm()
  cross = mha()
  n2 = norm()
  ff = ffn()
  n3 = norm()
  forward(y, memory) {
    const h1 = this.n1(this.self(y), y)
    const h2 = this.n2(this.cross(h1, memory), h1)
    return this.n3(this.ff(h2), h2)
  }
}

// positional encoding: a ⊕ with a ~ beside it
const withPE = (fig, x, side) => {
  const sum = op('+')
  return sum(x, fig.input(op('~', { [side]: sum })))
}

const fig = new Figure({ flow: 'BT' })
const x = embed('Input Embedding')(fig.input('Inputs'))
const y = embed('Output Embedding')(fig.input('Outputs\n(shifted right)'))
const memory = new EncoderLayer({ repeat: 'N×' })(withPE(fig, x, 'leftOf'))
const out = new DecoderLayer({ repeat: 'N×' })(withPE(fig, y, 'rightOf'), memory)
text('Output Probabilities')(softmax()(linear()(out)))
```

## Mixture of Experts — explicit lanes for parallel branches

Shows: integer `lane` per expert keeps them in a fixed left-to-right order;
fractional `lane: 1.5` centers the router and the input over four experts;
dashed edges for unchosen routes and an edge label for the chosen one.

```ts
class SwitchFFN extends Module {
  router = softmax('Router', { lane: 1.5 })
  experts = [0, 1, 2, 3].map(i => ffn(`FFN ${i + 1}`, { lane: i }))
  forward(x) {
    const p = this.router(x)
    // top-1 routing: expert 2 is chosen, the others are drawn dashed
    this.experts.forEach((e, i) => { if (i !== 1) e(p.edge({ dashed: true })) })
    return mul(this.experts[1](p.edge('$p_2$')))
  }
}

const fig = new Figure({ flow: 'BT' })
const y = new SwitchFFN()(fig.input('$\\mathbf{x}$', { lane: 1.5 }))
text('$\\mathbf{y}=p_i(\\mathbf{x})\\,E_i(\\mathbf{x})$')(y)
```

## ViT — data blocks, magnify, inputs above / below a ⊕

Shows: a real image with a patch grid; `magnify` pulling one patch out and
feeding it on; two extra inputs placed `below` / `above` the ⊕ instead of in
new lanes; `ghost: 3` for a stacked encoder; `\n` to keep blocks narrow in LR.

```ts
const fig = new Figure({ flow: 'LR' })
const img = fig.input(image(src, 'Image', { size: [56, 56], grid: 4 }))
const patch = magnify('patch', { patch: [1, 1], size: [44, 44] })(img)
const tokens = linear('Linear Projection\nof Flattened Patches')(patch)

const sum = op('+')
const z = sum(tokens,
  fig.input('Position\nEmbedding', { below: sum }),
  fig.input('[class]\ntoken', { above: sum }))
const encoder = block('Transformer\nEncoder', { color: 'orange', ghost: 3 })
text('Class')(mlp('MLP\nHead')(encoder(z)))
```

## U-Net — lane as a data dimension

Shows: `lane: depth` turns the resolution level into the cross-axis position,
which produces the U shape with no coordinates; a helper per level; edge
`color` to separate down / up paths; dashed skip connections popped from a
stack.

```ts
const fig = new Figure({ flow: 'LR', gap: [34, 22] })
// one feature map per resolution level; lane = depth gives the U
const level = (channels, depth, color) =>
  stack(String(channels), { n: 2, size: [12, 72 - depth * 15], offset: 5, color, lane: depth })

let x = fig.input('input\nimage')
const skips = []
for (const [depth, c] of [64, 128, 256].entries()) {
  x = level(c, depth, 'blue')(depth ? x.edge({ color: 'red' }) : x)
  skips.push(x)
}
x = level(512, 3, 'purple')(x.edge({ color: 'red' }))
for (const [i, c] of [256, 128, 64].entries()) {
  const skip = skips.pop().edge({ dashed: true })
  x = level(c, 2 - i, 'teal')(x.edge({ color: 'green' }), skip)
}
text('segmentation\nmap')(x)
```

## DDPM — reverse edges and decorations beside nodes

Shows: a forward chain, then a reverse process added with `fig.edge(..., {
dashed: true, curve: true, label })` so it doesn't distort the ranks; sample
images attached `below` their state with a small `dist`.

```ts
const fig = new Figure({ flow: 'LR' })
const xT = circle('$\\mathbf{x}_T$', { color: 'gray' })
const xt = circle('$\\mathbf{x}_t$', { color: 'gray' })
const xt1 = circle('$\\mathbf{x}_{t-1}$', { color: 'gray' })
const x0 = circle('$\\mathbf{x}_0$')
const dots = () => text('$\\cdots$')

let h = dots()(fig.input(xT))
h = xt1(xt(h).edge('$p_\\theta(\\mathbf{x}_{t-1}|\\mathbf{x}_t)$'))
x0(dots()(h))
fig.edge(h, xt, { label: '$q(\\mathbf{x}_t|\\mathbf{x}_{t-1})$', dashed: true, curve: true })

for (const [state, src] of [[xT, noisyImage], [x0, cleanImage]])
  fig.input(image(src, { size: [40, 40], below: state, dist: 10 }))
```

## LoRA — frozen vs. trainable, legend

Shows: `freeze()` / `trainable()` instead of words; one big block sized with
`w` / `h` to dominate; an edge label for the rank `r`; `legend` beside the
figure.

```ts
const fig = new Figure({ flow: 'BT', legend: { position: 'right' } })
const x = fig.input('$\\mathbf{x}\\in\\mathbb{R}^d$')

const W = block('Pretrained Weights\n$W\\in\\mathbb{R}^{d\\times d}$', { w: 170, h: 70 }).freeze()
const A = thin('$A=\\mathcal{N}(0,\\sigma^2)$').trainable()
const B = thin('$B=0$').trainable()

text('$\\mathbf{h}$')(add(W(x), B(A(x).edge('$r$'))))
```

## LLaVA — aligning two streams, a wide block spanning them

Shows: `fig.rank(Hv, Hq)` puts the two token rows on the same level even
though their paths have different lengths; a wide `w: 330` block at
`lane: 0.5` spanning both lanes, with its output text on the same lane; a
helper for labelled token vectors.

```ts
const fig = new Figure({ flow: 'BT', legend: true })
const tokens = (name, color) => vector([`$\\mathbf{${name[0]}}_\\text{${name[1]}}$`, '', '', ''], { color })

const img = fig.input(image(src, { size: [64, 48], caption: 'Image $\\mathbf{X}_\\text{v}$' }))
const instruction = fig.input('Language Instruction $\\mathbf{X}_\\text{q}$')

const Zv = tokens('Zv', 'gray')(enc('Vision Encoder', { w: 150 }).freeze()(img))
const Hv = tokens('Hv', 'orange')(thin('Projection $\\mathbf{W}$').trainable()(Zv))
const Hq = tokens('Hq', 'blue')(instruction)
fig.rank(Hv, Hq)

const llm = block('Language Model $f_\\phi$', { w: 330, h: 56, lane: 0.5 }).freeze()
text('Language Response $\\mathbf{X}_\\text{a}$', { lane: 0.5 })(llm(Hv, Hq))
```

## PixDiT, compact — a module stacked across the flow, ops as edge labels

Shows: an LR figure whose modules are TB columns. Each module's blocks share
one rank (`fig.rank(mm.tt, mm.c, mm.st)`) and are stacked by `lane`; edges
between them are short vertical lines. AdaLN-Zero and Text Encoding are edge
labels, not blocks. The straight node-for-node translation of the same graph
was about 5 : 1; this one is about 2.4 : 1.

```ts
class MMDiT extends Module {
  tt = block('Text Token', { color: 'green', lane: 0 })
  c = block('Condition', { color: 'gray', lane: 1 })
  st = block('Semantic Token', { color: 'blue', lane: 2 })
  forward(text, t, patches) {
    const c = this.c(t)
    this.tt(text.edge('Text Encoding'), c.edge('AdaLN-Zero'))
    return this.st(patches, c.edge('AdaLN-Zero'))
  }
}

class PiT extends Module {
  c = block('Condition', { color: 'gray', lane: 1 })
  pt = block('Pixel Token', { color: 'blue', lane: 2 })
  forward(semantic, pixels) {
    return this.pt(pixels, this.c(semantic).edge('AdaLN-Zero'))
  }
}

const fig = new Figure({ flow: 'LR' })
const prompt = block('User Prompt')(fig.input(block('System Prompt', { lane: 0 })))
const t = fig.input('Timestep Embedding', { lane: 1 })
const img = fig.input(block('Noised Image', { lane: 2 }))
const p16 = thin('16×16\nPatchify', { lane: 2 })(img)
const p1 = thin('1×1 Patchify', { lane: 3 })(img)

const mm = new MMDiT({ label: 'MM-DiT Blocks', repeat: '×N', repeatSide: 'bottom' })
const st = mm(prompt, t, p16)
const pit = new PiT({ label: 'PiT Blocks', repeat: '×M', repeatSide: 'bottom' })
empty()(pit(st, p1))
fig.rank(mm.tt, mm.c, mm.st).rank(pit.c, pit.pt)
```

## MM-DiT, folded — two streams down the middle and back up the sides

Shows: each stream's attention half runs down an inner lane, turns at its ⊕,
and its FFN half runs back up an outer lane; `fig.rank` pins every block on the
way back to the block at the same height on the way down, and the output to the
input. The shared condition MLP is on top (ranked with the inputs) so all its
edges flow down. Modulation for the outer columns goes through invisible
`empty` taps chained down the gutter (`lane: 0.5` / `2.5`) and enters from the
side. Edge `color` per stream. Unfolded, this was about 1 : 1.5, with the modulation edges bunched in the middle;
folded it is about 1.4 : 1 with no crossings. Needs forwardfig after 0.1.2 for
the second stream to fold reliably.

```ts
const rmsnorm = preset('thin', 'RMSNorm', 'white')
const mod = preset('thin', 'Scale & Shift', 'white')
const gate = preset('thin', 'Gate', 'white')

const fig = new Figure({ flow: 'TB' })
const x1 = fig.input(block({ lane: 1, color: 'blue', w: 36, h: 24 }))
const x2 = fig.input(block({ lane: 2, color: 'green', w: 36, h: 24 }))
const m = mlp('MLP', { lane: 1.5, color: 'white' })
const c = m(fig.input(block({ lane: 1.5, color: 'gray', w: 36, h: 24 })))
fig.rank(x1, x2, m)
const cond = side => c.edge({ color: 'gray', join: 'side', side })
const attn = mha('Joint MHSA', { lane: 1.5, color: 'red' })

const down = (x, lane, color) => {
  const n1 = rmsnorm({ lane }), s1 = mod({ lane }), qkv = vector(['q', 'k', 'v'], { lane, color }), g1 = gate({ lane })
  const h = qkv(s1(n1(x.edge({ color })), cond()).edge({ color }))
  return { x, n1, s1, qkv, g1, h }
}
const up = (s, y, lane, color) => {
  const side = lane ? 'right' : 'left'
  const r1 = op('+', { lane })(s.g1(y.edge({ color }), cond(side)).edge({ color, join: 'side' }), s.x.edge({ color, side }))
  const n2 = rmsnorm({ lane }), s2 = mod({ lane }), f = ffn('FFN', { lane, color: 'white' }), g2 = gate({ lane })
  const gutter = lane ? 2.5 : 0.5
  const t3 = empty({ lane: gutter })(c.edge({ color: 'gray', arrow: 'none' }))
  const t2 = empty({ lane: gutter })(t3.edge({ color: 'gray', arrow: 'none' }))
  const r2 = op('+', { lane })(g2(f(s2(n2(r1.edge({ color })), t2.edge({ color: 'gray' })).edge({ color })).edge({ color }), t3.edge({ color: 'gray' })).edge({ color }), r1.edge({ color, side }))
  const out = empty({ lane })(r2.edge({ color }))
  fig.rank(n2, s.g1).rank(s2, attn).rank(f, s.qkv).rank(g2, s.s1).rank(r2, s.n1).rank(out, s.x)
  fig.rank(t2, s2).rank(t3, g2)
}

const a = down(x1, 1, 'blue'), b = down(x2, 2, 'green')
const y = attn(a.h.edge({ color: 'blue' }), b.h.edge({ color: 'green' }))
up(a, y, 0, 'blue')
up(b, y, 3, 'green')
```
