import * as api from './api'
import { layout } from './layout'
import { THEMES, render } from './render'
import type { Diagram } from './types'

export * from './api'
export type { Diagram, Node, Edge, Group, Dir } from './types'

/** Drawing core: lay out and render a plain Diagram (what Figure.diagram() returns). */
export function draw(d: Diagram, options: { theme?: string; materials?: boolean } = {}): string {
  return render(layout(d), options.theme, options.materials ?? true)
}
export { layout, THEMES }

export default { ...api, draw, layout, THEMES }
