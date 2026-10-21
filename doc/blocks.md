---
title: Blocks
group: Guide
order: 2
description: Every block shape and ML preset, the options they share, and how to define your own preset.
---

# Blocks

Every block factory takes `(label?, options?)` or `(options?)`. `image(src, …)` and `vector(values, …)` take their data first.

## Basic shapes

```ts figure
import { Figure, block, thin, circle, op, enc, dec, tensor, stack, neurons, vector } from 'forwardfig'

const fig = new Figure({ flow: 'LR', gap: [40, 24] })
let x = fig.input(block('block'))
x = thin('thin')(x)
x = circle('$\\mathbf{z}$')(x)
x = op('+')(x)
x = dec('dec')(enc('enc')(x))
x = tensor('tensor', { size: [24, 40, 16] })(x)
x = stack('stack', { n: 3, size: [30, 40] })(x)
x = neurons('neurons', { n: 3 })(x)
vector(['$a$', '$b$', '$c$'], 'vector')(x)
```

| Factory | Draws | Shape-specific options |
| --- | --- | --- |
| `block` | A rounded block | — |
| `thin` | A flat block (norms, activations) | — |
| `text` | A label without a box | — |
| `circle` | A variable | — |
| `op` | ⊕ `'+'`, ⊗ `'*'`, ∼ `'~'`, or any short label | — |
| `enc` / `dec` | A trapezoid that narrows / widens along the flow | — |
| `tensor` | A 3D box | `size: [w, h, depth]` |
| `stack` | Stacked feature maps | `n`, `size: [w, h]`, `offset` |
| `neurons` | A column of units | `n`; join two with `edge({ dense: true })` |
| `vector` | A row of values | `values` is the first argument |

## ML presets

Presets are a shape with a default label and color. Call them with no arguments for the usual block, or override the label and options.

| Preset | Label | Color | Shape |
| --- | --- | --- | --- |
| `mha` | Multi-Head Attention | orange | block |
| `attention` | Attention | orange | block |
| `ffn` | Feed Forward | blue | block |
| `mlp` | MLP | blue | block |
| `norm` | Add & Norm | yellow | thin |
| `embed` | Embedding | pink | block |
| `linear` | Linear | purple | thin |
| `softmax` | Softmax | green | thin |
| `matmul` | MatMul | purple | thin |
| `concat` | Concat | yellow | thin |
| `conv` | Conv | teal | block |
| `pool` | Pool | gray | thin |
| `act` | ReLU | green | thin |
| `dropout` | Dropout | gray | thin |
| `loss` | Loss | red | block |

## Options every block takes

| Option | Type | What it does |
| --- | --- | --- |
| `id` | `string` | A stable id in the [Diagram](drawing-core.md). Must be unique. |
| `color` | palette name or CSS color | `pink orange yellow green blue purple teal red gray white`, `#hex`, or any CSS color. Default: neutral grey. |
| `texture` | `Texture` | The surface. See [Styling](styling.md#textures). |
| `frozen` / `trainable` | `boolean` | Ice or magma, with a badge. Same as `freeze()` / `trainable()`. |
| `crossed` | `boolean` | Dims the block and lays a red ✕ over it. |
| `dashed` / `bold` | `boolean` | Outline style. |
| `w` / `h` | `number` | Fixed size in px. |
| `ghost` | `number` | Stacked copies behind the block, e.g. attention heads. |
| `caption` | `string` | Small text under the block. |
| `fontSize` | `number` | Label size in px. |
| `fontFamily` | `string` | Label font (CSS font family). |

Placement options (`lane`, `align`, `leftOf`, …) are on the [Layout](layout.md) page.

## Your own presets

`preset(shape, label, colorOrDefaults)` defines a block type the way the built-ins are defined.

```ts figure
import { Figure, preset } from 'forwardfig'

const rmsnorm = preset('thin', 'RMSNorm', 'yellow')
const moe = preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })

const fig = new Figure({ flow: 'LR' })
moe()(rmsnorm()(fig.input('x')))
```

`kind` (default: the shape name) is the key a [style config](styling.md#style-config) matches with `kinds`.
