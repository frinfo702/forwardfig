---
title: Layout and edges
group: Guide
order: 5
description: How blocks are placed, how to override placement, and every edge option.
---

# Layout and edges

Placement is automatic. Blocks sit on a grid of ranks (the longest path from an input) and lanes (a block inherits its first input's lane), so chains are always straight. Edges are orthogonal: straight, one Z bend, or a detour around blocks.

## Flow direction

`new Figure({ flow })` takes `'TB'` (default), `'BT'`, `'LR'` or `'RL'`. `gap: [along, across]` sets the spacing in px.

## Overriding placement

| Option | What it does |
| --- | --- |
| `lane` | The cross-axis column. Fractions sit between columns; negative lanes come before lane 0. |
| `align: ref` | Same column as another block. |
| `leftOf` / `rightOf` / `above` / `below: ref` | Next to another block, `dist` px apart (default 22). Taken out of the grid. |
| `at: [x, y]` | An absolute position in px. |
| `nudge: [dx, dy]` | A shift after layout. |
| `fig.rank(a, b, …)` | Puts blocks on the same rank (a row in TB / BT, a column in LR / RL). |

`ref` is a layer or a tensor.

```ts figure
import { Figure, op, linear, block, mlp, text } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const tokens = linear('Patch\nEmbedding')(fig.input('patches'))
const sum = op('+')
const z = sum(tokens, fig.input('Position\nEmbedding', { below: sum }), fig.input('[class]', { above: sum }))
text('Class')(mlp('MLP Head')(block('Transformer\nEncoder', { color: 'orange', ghost: 3 })(z)))
```

## Edges

Style an edge with `x.edge({...})` before the call, or add one outside `forward` with `fig.edge(from, to, {...})`. A string is a label: `x.edge('$r$')`.

| Option | What it does |
| --- | --- |
| `label` | Text beside the edge. TeX works. |
| `dashed`, `thick`, `color` | Line style. |
| `arrow` | `'end'` (default), `'both'` or `'none'`. |
| `crossed` | A red ✕ in the middle: a cut connection. |
| `curve` | A curved edge instead of right angles. |
| `skip` | Forces the detour around blocks (residuals get it automatically). |
| `side` | Where a detour runs: `left` / `right` in TB / BT, `top` / `bottom` in LR / RL. |
| `join: 'side'` | Comes down the source's line and turns into the target's side (an L). For conditioning taps; it does not decide the target's column. |
| `dense` | All-to-all lines between two `neurons` layers. |

## How edges are routed

- When several arrows enter one block, the one that goes dead straight never moves; on a small ⊕ the others join from the side.
- Edges against the flow are drawn straight, as an L, or as a Z when the way is clear; otherwise as a U around the side. A block fed only against the flow takes the lane of the block it feeds, so a column can run back up.
- Lanes are reordered when that removes edge crossings: whole columns swap, so chains stay straight, and a lane you set with `lane` never moves. This is a greedy pass, so some crossings can remain.
- An edge label sits beside the edge's longest segment; if that spot touches a block, a group title, another edge or a label, it takes the first free one (the other side, another segment, or shifted along it).

```ts figure
import { Figure, block, text } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const xT = text('$\\mathbf{x}_T$'), xt = block('$\\mathbf{x}_t$'), x0 = text('$\\mathbf{x}_0$')
const h = xt(fig.input(xT))
x0(h.edge('$p_\\theta$'))
fig.edge(h, xT, { label: '$q$', dashed: true, curve: true })
```
