---
title: Concepts
group: Guide
order: 1
description: The four objects of the API — Layer, Module, Tensor and Figure — and how a figure is traced from them.
---

# Concepts

A figure is traced, not described. You call layers on tensors as you would in PyTorch or Keras, and every call records a block and the edges into it.

| Object | Role | Analogy |
| --- | --- | --- |
| `Layer` | One block. Calling it as `layer(x, y)` draws edges into it and returns a `Tensor`. | `nn.Linear`, `keras.layers.Dense` |
| `Module` | A subclass with `forward()`. Instances are callable. `label` or `repeat` draws a group box. | `nn.Module` |
| `Tensor` | The value flowing between blocks. `x.edge(...)` styles the next edge it enters. | KerasTensor |
| `Figure` | The drawing side: inputs, extra edges, ranks, rendering. | `plt.figure` |

## Layers are nodes

A layer is one block. Calling the same layer again adds edges to the same block, so shared weights stay one block.

```ts figure
import { Figure, enc, thin } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const f = enc('Encoder $f$').trainable()        // one encoder, called on two views
const h = thin('normalize')(f(fig.input('view 1'), fig.input('view 2')))
```

Functional ops are the exception: `add(...xs)` and `mul(...xs)` make a new ⊕ / ⊗ on every call, like `torch.add`.

## Modules are groups

Subclass `Module` and implement `forward()`. Layers created as fields are the module's blocks. Pass `label`, `repeat` or `box: true` to draw a group box around them.

```ts figure
import { Figure, Module, Tensor, conv, act, add, text } from 'forwardfig'

class BasicBlock extends Module {
  body = [conv('weight layer'), act('relu'), conv('weight layer')]
  relu = act('relu')
  forward(x: Tensor) {
    const f = this.body.reduce((h, layer) => layer(h), x)
    return this.relu(add(f, x.edge('identity')))
  }
}

const fig = new Figure()
text('$\\mathcal{F}(\\mathbf{x})+\\mathbf{x}$')(new BasicBlock({ label: 'residual block' })(fig.input('$\\mathbf{x}$')))
```

`forward()` may take several tensors and return anything — a tensor, an array, an object.

## Tensors carry edge style

`x.edge('$r$')` labels the next edge `x` flows into; `x.edge({ dashed: true })` styles it. The original tensor is unchanged, so you can branch with different styles.

## Two ways to write a figure

- **All in the figure**: `figure(fig => { ... })` or `figure({ flow: 'LR' }, fig => { ... })` builds everything in one place.
- **By module**: define each `Module` next to your model code, then call them in a figure.

Both produce the same `Figure`; mix them freely.
