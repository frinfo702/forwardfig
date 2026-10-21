// The drawing core's input: plain data. The Figure API (api.ts) compiles to
// this; anything that can produce a Diagram can use layout() and render().

export type Dir = 'TB' | 'BT' | 'LR' | 'RL'

export interface Node {
  // shape: block thin op circle text tensor stack enc dec neurons vector image gaussian space sphere empty
  id: string; shape: string; label: string; color?: string
  flags: Set<string>; attrs: Record<string, string>; groups: string[]; order: number
  // filled by layout (screen coords, center)
  x: number; y: number; w: number; h: number
}
export interface Edge {
  from: string; to: string; op: string; label?: string
  flags: Set<string>; attrs: Record<string, string>
  // filled by layout
  pts: [number, number][]; curve?: number; fc?: boolean; lx?: number; ly?: number
}
export interface Group {
  id: string; label: string; parent?: string; flags: Set<string>; attrs: Record<string, string>
  x: number; y: number; w: number; h: number
}
export interface Diagram {
  dir: Dir; theme: string; gap?: [number, number]
  /** base text size (px); blocks may set attrs.fontSize */
  fontSize?: number
  /** base CSS font family; blocks may set attrs.fontFamily */
  fontFamily?: string
  /** a key to the looks the figure uses (frozen, trainable, textures, crossed); labels override the names */
  legend?: { position?: 'bottom' | 'right'; labels?: Partial<Record<string, string>> }
  nodes: Map<string, Node>; edges: Edge[]; groups: Group[]; ranks: string[][]
}

