---
title: API reference
nav: API
group: Reference
order: 1
description: Every export of forwardfig with its signature, grouped by role.
---

# API reference

Everything is a named export of `forwardfig`; the default export bundles them as one object.

## Figure

| Member | Signature | Notes |
| --- | --- | --- |
| `new Figure` | `(options?: FigureOptions)` | `flow`, `theme`, `gap`, `materials`, `legend`, `style`, `kinds`. |
| `figure` | `(build)` or `(options, build)` → `Figure` | Builds a figure in one callback. |
| `fig.input` | `(label \| layer = '', options?)` → `Tensor` | A starting point. With a layer, `options` are added to it. |
| `fig.edge` | `(from: Tensor, to: Tensor \| Layer, style?)` → `this` | An edge outside `forward`. Keeps `from`'s `.edge()` style. |
| `fig.rank` | `(...refs)` → `this` | Same rank. |
| `fig.svg` | `({ theme? })` → `string` | Works without a DOM. |
| `fig.mount` | `(target, { theme? })` → `this` | An element or a CSS selector. |
| `fig.toBlob` | `(ExportOptions)` → `Promise<Blob>` | See [Export](export.md). |
| `fig.download` | `(filename, ExportOptions?)` → `Promise<void>` | Browser only. |
| `fig.diagram` | `()` → `Diagram` | The plain data the drawing core takes. |

## Layers

| Member | Signature | Notes |
| --- | --- | --- |
| block factories | `(label?, options?)` or `(options?)` → `Layer` | See [Blocks](blocks.md). |
| `image` | `(src \| src[], label?, ImageOptions?)` | |
| `vector` | `(values: string[], label?, NodeOptions?)` | |
| `magnify`, `matrix`, `voxels`, `waveform` | `(label?, options?)` | See [Images and data](images-and-data.md). |
| `add`, `mul` | `(...xs: Tensor[])` → `Tensor` | A new ⊕ / ⊗ on each call. |
| `preset` | `(shape, label?, color \| defaults)` → factory | `defaults.kind` names it for `kinds`. |
| `layer` | `(shape, label, options, kind?, defaults?)` → `Layer` | The primitive the factories use. |
| `layer(...xs)` | `(...inputs: Tensor[])` → `Tensor` | Calling a layer again adds inputs to the same block. |
| `layer.freeze()` / `layer.trainable()` | `()` → `this` | |
| `layer.shape`, `layer.kind`, `layer.label`, `layer.options` | | `options` is what you passed; it wins over every style. |

## Modules and tensors

| Member | Signature | Notes |
| --- | --- | --- |
| `Module` | `abstract class`, `forward(...inputs)` | Instances are callable. |
| `new Module` | `(ModuleOptions?)` | `label`, `repeat`, `repeatSide`, `box`, `color`, `dashed`, `texture`, `frozen`, `trainable`, `style`, `kinds`, `id`. |
| `module.freeze()` / `module.trainable()` | `()` → `this` | Applies to every block inside. |
| `tensor.edge` | `(EdgeOptions \| label)` → `Tensor` | Styles the next edge this tensor enters. |

`repeatSide` is `'auto'` (default), `'top'`, `'bottom'`, `'left'` or `'right'`. `auto` takes the first spot that collides with no block, edge, label or other group.

## Configuration

| Member | Signature | Notes |
| --- | --- | --- |
| `configure` | `(Config \| null)` → `FigureOptions` | Library-wide defaults; `null` resets. Returns a copy. |
| `Config.tex` | `TexEngine \| null` | See [Math labels](math.md). |

## Drawing core

| Member | Signature | Notes |
| --- | --- | --- |
| `draw` | `(d: Diagram, { theme?, materials? })` → `string` | Layout + render. |
| `layout` | `(d: Diagram)` → `Diagram` | Fills in positions and edge points. |
| `THEMES` | `Record<'light' \| 'dark', Theme>` | The palettes. |

See [Drawing core](drawing-core.md) for the `Diagram` shape.

## Types

`Ref` (`Tensor | Layer`), `Texture`, `Cell`, `Shape`, `NodeOptions` and the per-block option types (`ImageOptions`, `MatrixOptions`, …), `EdgeOptions`, `ModuleOptions`, `FigureOptions`, `Style`, `StyleConfig`, `ExportOptions`, `Diagram`, `Node`, `Edge`, `Group`, `Dir`.
