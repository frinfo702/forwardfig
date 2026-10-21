import { layout } from './layout'
import { parse } from './parse'
import { THEMES, render as draw } from './render'

export { parse, layout, THEMES }
export type { Diagram, Node, Edge, Group } from './parse'

export interface Options {
  theme?: string
  /** Bake realistic ice / magma with WebGL when available (default true). false = vector look only. */
  materials?: boolean
}

/** Source text → SVG string. Pure: no DOM needed (the DOM is only used to measure text when present). */
export function render(src: string, opts: Options = {}): string {
  return draw(layout(parse(src)), opts.theme, opts.materials ?? true)
}

/** Replace every matching element's text with its rendered diagram. */
export function run(selector = '.machine-mermaid', opts: Options = {}) {
  document.querySelectorAll<HTMLElement>(selector).forEach(el => {
    const src = el.dataset.src ?? el.textContent ?? ''
    el.dataset.src = src
    try {
      el.innerHTML = render(src, { ...opts, theme: el.dataset.theme ?? opts.theme })
    } catch (err) {
      el.innerHTML = `<pre style="color:#c0392b;white-space:pre-wrap">machine-mermaid: ${String((err as Error).message).replace(/</g, '&lt;')}</pre>`
    }
  })
}

export default { render, run, parse, layout, THEMES }
