# Recipes: paper figures and the technique each one shows

These come from the demo gallery (`demo/index.html`, the `figs` JSON block, 23
figures in all — read it for CNNs, VAE, GAN, CLIP, QLoRA, PointNet, wav2vec,
AlexNet, causal attention). Gallery snippets end in `return fig`; in a file for
the CLI, use `export default fig`. `demoImage()` is a gallery helper; pass an
image URL, data URL, `<img>` or `<canvas>` instead.

Contents: Transformer · Mixture of Experts · ViT · U-Net · DDPM · LoRA · LLaVA

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
