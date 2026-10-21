---
title: Draw the model the way you write it.
nav: Overview
group: Start
order: 1
description: What machine-mermaid is, what a figure looks like in code, and where to go next.
---

# Draw the model the way you write it.

machine-mermaid draws ML architecture figures from TypeScript that reads like the model itself. A block is a callable layer, a sub-network is a `Module` with `forward()`, and the figure follows the data flow. It has zero dependencies, is about 19 KB gzipped, and outputs SVG in the browser and in Node.

```ts figure
import { Figure, Module, Tensor, mha, norm, ffn, text } from 'machine-mermaid'

class EncoderLayer extends Module {
  attn = mha()
  n1 = norm()
  ff = ffn()
  n2 = norm()
  forward(x: Tensor) {
    const h = this.n1(this.attn(x), x)   // Add & Norm with a residual
    return this.n2(this.ff(h), h)
  }
}

const fig = new Figure({ flow: 'BT' })
const y = new EncoderLayer({ repeat: 'N×' }).freeze()(fig.input('$\\mathbf{x}$'))
text('$\\mathbf{h}$')(y)
```

Every figure on this site is drawn from the code beside it when the docs are built.

## What it is good at

- **Paper figures of networks.** Residuals route around blocks, ⊕ joins line up, `repeat: 'N×'` sits beside a group without colliding with anything.
- **Training state.** `freeze()` and `trainable()` give blocks an ice or magma surface and a badge; textures mark quantized, sparse or masked parts.
- **Data, not only boxes.** Images, patch grids, matrices, voxel volumes, Gaussians, point clouds and waveforms are blocks too.
- **Math.** Labels take TeX, typeset by MathJax when the page has it and by a small built-in engine otherwise.

## Where to go next

- [Getting started](getting-started.md): install it and draw a first figure.
- [Concepts](concepts.md): layers, modules, tensors and the figure.
- [Blocks](blocks.md) and [Images and data](images-and-data.md): everything you can draw.
- [API reference](api.md): every export and option in one place.
- [Changelog](changelog.md): what changed recently, with a migration table.
