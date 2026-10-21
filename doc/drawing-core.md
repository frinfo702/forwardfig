---
title: Drawing core
group: Reference
order: 2
description: The plain Diagram data under the API, and how to drive layout and rendering from anything that produces it.
---

# Drawing core

The layout and rendering engine does not know about layers or modules. `fig.diagram()` compiles a figure into plain `Diagram` data, and `draw(diagram)` turns it into SVG. Anything that can produce a `Diagram` — another language, a JSON file, a model exporter — can use the same engine.

```ts
import { draw } from 'forwardfig'

const svg = draw(diagram, { theme: 'dark', materials: false })
```

## Diagram

```ts
interface Diagram {
  dir: 'TB' | 'BT' | 'LR' | 'RL'
  theme: string
  gap?: [number, number]
  fontSize?: number
  nodes: Map<string, Node>
  edges: Edge[]
  groups: Group[]
  ranks: string[][]          // node ids on the same rank
}

interface Node {
  id: string; shape: string; label: string; color?: string
  flags: Set<string>         // frozen train dashed bold crossed
  attrs: Record<string, string>
  groups: string[]           // ids of the groups it is in, outermost first
  order: number
  x: number; y: number; w: number; h: number   // filled by layout
}

interface Edge {
  from: string; to: string
  op: string                 // -> ..> -- .. <-> =>
  label?: string
  flags: Set<string>         // skip curve thick dashed crossed join
  attrs: Record<string, string>
  pts: [number, number][]    // filled by layout
}

interface Group {
  id: string; label: string; parent?: string
  flags: Set<string>; attrs: Record<string, string>
  x: number; y: number; w: number; h: number   // filled by layout
}
```

`shape` is one of `block thin text circle op enc dec tensor stack neurons vector matrix voxels image magnify gaussian space sphere pointcloud waveform plot empty`. Shape-specific data lives in `attrs` as strings: numbers as `"12"`, number lists as `"36,64,20"`, structured data as JSON.

## How it works

1. **Ranks.** `rank` sets are merged, back edges are found by DFS, and each block gets its longest-path rank.
2. **Lanes.** A block takes the lane of its first unclaimed input; a ⊕ fed by several inputs on one rank sits between them.
3. **Coordinates.** Lanes and ranks are sized by their largest block, with extra room where group membership changes and where an edge label needs it.
4. **Routing.** Straight or Z edges first, then arrowheads entering the same block are spread, then edges against the flow, then detours in free channels beside everything they pass.
5. **Groups.** Boxes are fitted around their members and internal edges, children before parents.

Text is measured with canvas `measureText` (cached); without a DOM, a width table approximates it.
