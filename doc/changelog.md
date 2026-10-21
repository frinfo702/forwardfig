---
title: Changelog
group: Reference
order: 3
description: Recent changes to forwardfig, with a migration table for the renamed APIs.
---

# Changelog

## Unreleased

A review pass over the TypeScript API. Four changes break existing code; the [migration table](#migration) lists them.

### Breaking

- `train()` / `train:` are now `trainable()` / `trainable:`, on layers and modules. `model.train()` means training mode in PyTorch, which this is not.
- `matrix` / `voxels`: `cell` (the cell size) is now `cellSize`, so it no longer reads like `cells` (the data).
- `space`: `axes` is now `{ x, y, z }`, the same object form as `matrix` / `voxels`.
- `circle()` blocks have the shape `'circle'` in a `Diagram` (was `'var'`).

### Added

- `style.fontFamily`: the figure's font (or one block's), with the same scoping as `fontSize`. Label widths are measured in it.
- `figure(build)` without options.
- `vector(values, label?, options?)` takes a label.
- `fig.input(layer, options)` adds `options` to the layer (they were ignored).
- `ModuleOptions` takes `frozen` and `trainable`.
- `Layer.shape` is typed as `Shape`.
- `FigureOptions.legend`: a key to the looks a figure uses (frozen, trainable, textures, crossed), under or beside it, with optional label overrides.
- A `forwardfig <file> [-o out.svg] [--theme dark]` command that writes a module's figures as SVG, or as PNG / JPEG / WebP by the `-o` extension with the optional peer dependency `sharp` (`--scale`, `--background`), for Makefile / LaTeX workflows. See [Export](export.md#command-line).
- Layout reorders lanes to reduce edge crossings. Whole columns swap, so chains stay straight; an explicit `lane` never moves, and groups stay contiguous. Figures without crossings are unchanged.

### Fixed

| Symptom | Fix |
| --- | --- |
| A CSS color name (`'crimson'`, `rgb(...)`) gave `#NaN` gradients | Only `#hex` colors are mixed; others are used as they are |
| Cell values outside 0–1 gave invalid colors | Shades are clamped |
| A negative or fractional class threw a TypeError | Classes wrap into the eight colors |
| A user id such as `n1` collided with an automatic id | Automatic ids skip taken ones; nodes and groups share one namespace |
| `fig.edge(x.edge({ dashed: true }), B)` drew a solid line | `fig.edge` keeps the tensor's style |
| `voxels({ cells })` ignored the array's size | Rows, columns and depth are inferred |
| `matrix({ cells: [] })` had `-Infinity` columns | Zero columns |
| A `"` in an image URL or a color broke out of the attribute | Attribute values are escaped; CSS colors stay out of SVG ids |
| Changing what `configure()` returned changed the global config | It returns a copy |
| An edge `color` that was a CSS color name was ignored | It is used as given |
| Edge labels could sit on blocks, other edges or each other | A label takes the first free spot: the other side, another segment, or shifted along it |

### Migration

| Before | After |
| --- | --- |
| `block('W').train()` | `block('W').trainable()` |
| `{ train: true }` | `{ trainable: true }` |
| `new M().train()` | `new M().trainable()` or `new M({ trainable: true })` |
| `matrix({ cell: 12 })` | `matrix({ cellSize: 12 })` |
| `space({ axes: ['a', 'b', 'c'] })` | `space({ axes: { x: 'a', y: 'b', z: 'c' } })` |
| `shape: 'var'` in a `Diagram` | `shape: 'circle'` |

## Earlier

Columns that flow back up and side-joining taps (`join: 'side'`); axis names for matrix and voxels; per-cell looks; `magnify`; frames of different images; tilted and rotated images; point clouds and waveforms; `repeatSide`; MathJax typesetting; `preset()` and the scoped style config. See the [commit history](https://github.com/frinfo702/forwardfig/commits/main).
