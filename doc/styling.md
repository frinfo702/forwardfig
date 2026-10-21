---
title: Styling
group: Guide
order: 4
description: Colors, textures, frozen and trainable weights, and the scoped style config.
---

# Styling

Blocks are neutral grey until you give them a color. Textures say what a block *is* — frozen, trainable, quantized, masked — and a style config sets defaults by scope, like matplotlib's rcParams.

## Colors

`color` takes a palette name (`pink orange yellow green blue purple teal red gray white`), a `#hex`, or any CSS color. Palette colors and hex colors get a matching tint in light and dark themes; other CSS colors are used as they are.

## Frozen and trainable

`freeze()` and `trainable()` work on a layer or on a module. On a module they apply to every block inside, unless a block is marked itself. A 🧊 or 🔥 in a label does the same.

```ts figure
import { Figure, block, thin, add, text } from 'forwardfig'

const fig = new Figure({ flow: 'BT' })
const x = fig.input('$\\mathbf{x}$')
const W = block('Pretrained $W$', { w: 150, h: 56 }).freeze()
const A = thin('$A$').trainable(), B = thin('$B$').trainable()
text('$\\mathbf{h}$')(add(W(x), B(A(x).edge('$r$'))))
```

## Textures

```ts figure
import { Figure, block } from 'forwardfig'

const fig = new Figure({ flow: 'LR', gap: [24, 16] })
for (const texture of ['ice', 'magma', 'glass', 'metal', 'noise', 'quantized', 'sparse', 'hatch'] as const)
  fig.input(block(texture, { texture, color: 'blue' }))
```

| Texture | Look | Typical use |
| --- | --- | --- |
| `ice` | Clear ice (WebGL) | Frozen weights; what `freeze()` gives |
| `magma` | Cracked magma (WebGL) | Trainable weights; what `trainable()` gives |
| `glass` | Frosted glass in the block's color (WebGL) | Soft prompts, adapters |
| `metal` | Brushed metal (WebGL) | Fixed ops, hardware |
| `noise` | Gaussian grain (WebGL) | Noise injection, diffusion |
| `quantized` | A 4-level mosaic (SVG) | Low-bit weights |
| `sparse` | A dot grid with gaps (SVG) | Pruning |
| `hatch` | Diagonal lines (SVG) | Masked, stop-gradient |

WebGL textures are baked once per block size and embedded as images. Without WebGL — in Node, or with `materials: false` — they fall back to vector looks, as on this page. When a block has both, `texture` decides the surface and the badge still follows `freeze()` / `trainable()` (QLoRA's quantized frozen base, for example).

## Style config

`style` applies to every block in a scope; `kinds` applies to one preset kind and beats `style` at the same level.

```ts
configure({ style: { fontSize: 14 }, kinds: { mha: { color: 'purple' } } })  // whole library
new Figure({ style: { color: 'gray', fontFamily: 'Times New Roman, serif' } }) // this figure
new Encoder({ style: { fontSize: 11, texture: 'glass' } })                  // blocks made inside this module
block('x', { fontSize: 20 })                                                // the block itself
configure(null)                                                             // reset
```

Precedence, strongest first: the block's own options › inner module › outer module › figure › `configure()` › the preset's defaults.

- `style` can set `color`, `texture`, `fontSize`, `fontFamily`, `dashed` and `bold`. At the figure and `configure` level, `fontSize` also sizes edge labels, group titles and captions, and `fontFamily` (any CSS font family) sets the font of the whole figure, e.g. to match a paper's body text. Math (`$...$`) keeps its TeX font.
- A texture set through `style` never hides `freeze()` / `trainable()`; a texture on the block itself does.
- `configure` also takes `theme`, `flow`, `gap`, `materials` and `tex`. It returns a copy of the current config.
