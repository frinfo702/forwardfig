---
title: Images and data
group: Guide
order: 3
description: Real images, magnifiers, matrices and voxel grids, 3D surfaces, point clouds and waveforms.
---

# Images and data

Inputs and intermediate values are often better shown than named. These blocks draw the data itself; their label sits above them.

## Images

`image(src, label?, options?)` takes a URL, a data URL, an `<img>` or a `<canvas>`. An array of sources draws a stack of frames, the first one in front.

```ts figure
import { Figure, image, linear } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const img = fig.input(image('../assets/robin.jpg', 'Image', { size: [64, 64], grid: 4 }))
const clip = fig.input(image('../assets/robin.jpg', 'Video', { size: [56, 56], n: 4, tilt: 35 }))
linear('Patch Embedding')(img, clip)
```

| Option | What it does |
| --- | --- |
| `size: [w, h]` | Frame size in px (default 64 × 64). |
| `fit` | `'cover'` (default) or `'contain'`. |
| `grid` | Overlays a g × g patch grid, as in ViT. |
| `n` | Draws a batch of n frames. |
| `tilt` | Degrees. Turns the frame around its vertical axis; positive sends the right edge back. |
| `rotate` | Degrees, in-plane. |

## Magnify

`magnify(options)(img)` enlarges part of the image it is called on. It draws the region's outline and zoom lines instead of an arrow, and its output feeds the next block.

```ts figure
import { Figure, image, magnify, linear } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const img = fig.input(image('../assets/robin.jpg', 'Image', { size: [64, 64], grid: 4 }))
linear('Linear Projection')(magnify('patch', { patch: [1, 1], size: [44, 44] })(img))
```

`patch: [col, row]` picks a cell of the source's grid; `region: [x, y, w, h]` picks a range in 0–1 fractions. `lens: 'square'` draws an inset instead of a glass, and `src` puts a picture of your own in the lens.

## Matrices and voxels

`matrix` draws a grid of cells; `voxels` draws a volume showing its front, top and right faces. A cell is a number in 0–1 (a shade of the block's color), a color string, or `{ value, color, texture, label, crossed }`.

```ts figure
import { Figure, matrix, voxels } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const T = 5
const x = fig.input(voxels({ rows: 4, cols: 4, depth: 3, cellSize: 12, axes: { rows: 'H', cols: 'W', depth: 'C' } }))
matrix('causal attention', {
  rows: T, cols: T, color: 'orange', axes: { rows: '$T$', cols: '$T$' },
  cells: (r, c) => (c > r ? { color: 'gray', crossed: true } : 0.3 + 0.12 * (r + c)),
})(x)
```

| Option | What it does |
| --- | --- |
| `rows`, `cols`, `depth` | Grid extent. Inferred from a `cells` array when omitted. |
| `cells` | An array (`[r][c]`, or `[r][c][d]` with d = 0 in front) or a function `(r, c, d?) => cell`. |
| `cellSize` | Cell size in px (default 16). |
| `axes` | Names along each axis: `{ rows, cols, depth }`. TeX works. |

## 3D and signals

```ts figure
import { Figure, gaussian, space, sphere, pointcloud, waveform } from 'forwardfig'

const fig = new Figure({ flow: 'LR', gap: [36, 24] })
let x = fig.input(waveform('audio'))
x = pointcloud('points', { shape: 'torus' })(x)
x = space('embedding', { points: [[0.5, 0.2, 0.1, 0], [-0.4, -0.3, 0.6, 1], [0.1, 0.7, -0.5, 2]] })(x)
x = sphere('$\\mathbb{S}^{d-1}$', { points: [[1, 0, 0, 0], [0, 1, 1, 1]] })(x)
gaussian('$p(\\mathbf{z})$', { peaks: [[-0.4, 0, 1, 0.35], [0.5, 0.3, 0.7, 0.3]] })(x)
```

| Factory | Data | Notes |
| --- | --- | --- |
| `gaussian` | `peaks: [[x, y, amp?, sigma?]]` | A Gaussian or mixture surface; `mesh` sets the resolution. |
| `space` | `points: [[x, y, z, class?]]` | A 3D scatter on axis panes; `axes: { x, y, z }` names them. |
| `sphere` | `points: [[x, y, z, class?]]` | Directions, normalized onto a sphere. |
| `pointcloud` | `points` or `shape: 'torus' \| 'sphere' \| 'cube'` | Nearer points are larger and darker; `n` points are sampled from `shape`. |
| `waveform` | `samples: ArrayLike<number>` in [-1, 1] | Reduced to at most 256 min/max columns, so the SVG stays small. |
| `plot` | `fn: (x) => number` | The graph of y = fn(x). See [Function plots](#function-plots). |

Coordinates are in [-1, 1]. `class` is any number; it picks one of eight colors.

## Function plots

`plot(fn, label?, options?)` draws the graph of y = fn(x) in a box, so arrows connect to it like any other block.

```ts figure
import { Figure, plot, act } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const x = fig.input(plot(Math.sin, '$\\sin x$', { x: [-Math.PI, Math.PI] }))
plot(Math.tanh, '$\\tanh$', { x: [-3, 3], color: 'green' })(act('tanh')(x))
```

| Option | What it does |
| --- | --- |
| `x` | Domain `[min, max]` (default `[-1, 1]`). |
| `y` | Range `[min, max]`. Taken from the samples when omitted; anything outside it is clipped. |
| `axes` | x and y axes with arrows, through the origin, or along the edge when 0 is out of range (default `true`). |
| `samples` | Points sampled across the domain (default 100). |
| `size` | `[w, h]` in px (default `[120, 84]`). |
| `points` | Scatter series, see below. |
| `name` | The curve's name in the legend. |
| `legend` | A key inside the box, in the corner that covers the fewest points (default `false`). |

NaN and ±Infinity break the curve, and so does a jump across the whole range (a pole, as in `tan`). There are no ticks, tick labels or grid.

### Scatter points

`points` draws `[x, y]` points with a marker, like matplotlib's `scatter`. Each series takes `at` (the points), `marker` (`circle`, `square`, `triangle`, `diamond`, `star`, `cross`), `color`, `label` and `size` (marker radius, default 3). Marker and color default to the next one in those lists, series by series. `fn` can be left out for points alone; then `x` defaults to the points' extent, and `y` always covers both the curve and the points. Points outside an explicit `x` / `y` are dropped.

`legend: true` adds a key inside the box, in the corner that covers the fewest points (top right on a tie): the curve, when it has a `name`, and each series with a `label`.

```ts figure
import { Figure, plot } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const noisy = (d: number) => [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(x => [x + d, Math.sin(x + d) + 0.3 * Math.cos(5 * x)] as [number, number])
fig.input(plot(Math.sin, 'fit', {
  x: [-Math.PI, Math.PI], y: [-1.4, 2.4], size: [200, 130], name: '$\\sin x$', legend: true,
  points: [{ at: noisy(0), label: 'train' }, { at: noisy(0.4), label: 'val', marker: 'triangle' }],
}))
```
