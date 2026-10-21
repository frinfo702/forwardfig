import type { Diagram, Edge, Group, Node } from './types'
import { FS, OUTSIDE, imageMatrix, labelSize, nums, values } from './layout'
import { bake, type Material } from './materials'
import { SANS, SERIF, layoutLabel } from './tex'

type Pair = [fill: string, stroke: string]
export interface Theme {
  bg: string; text: string; sub: string; edge: string; halo: string; group: Pair; shadow: string; dark: boolean
  /** blocks without a color: neutral grey, readable on light and dark pages */
  none: Pair
  ice: [string, string, string, string]; fire: [string, string, string]; c: Record<string, Pair>
}

export const THEMES: Record<string, Theme> = {
  light: {
    none: ['#e2e5e9', '#7f8794'], bg: 'none', text: '#1d2430', sub: '#5b6474', edge: '#39414f', halo: '#fff', group: ['#f5f6f9', '#d5dae2'], shadow: 'rgba(30,40,60,.10)', dark: false,
    ice: ['#f7fdff', '#d2effb', '#aedcf2', '#6fb9de'], fire: ['#fff6e8', '#ffcf9f', '#ee7d36'],
    c: {
      white: ['#ffffff', '#8b95a5'], gray: ['#eceff3', '#9aa3b2'], pink: ['#fde1e4', '#e58c98'], orange: ['#fde4c8', '#e69a50'],
      yellow: ['#f4f5cc', '#c0c064'], green: ['#d8f1de', '#68b880'], blue: ['#d6eafc', '#5f9fd8'], purple: ['#e4defa', '#9584db'],
      red: ['#ffd7d2', '#dd6559'], teal: ['#d1f0ec', '#48a99f'],
    },
  },
  dark: {
    none: ['#2a2f37', '#8a93a2'], bg: '#0e1117', text: '#e8edf5', sub: '#9aa4b5', edge: '#c3cad6', halo: '#0e1117', group: ['#161a22', '#2b323f'], shadow: 'rgba(0,0,0,.45)', dark: true,
    ice: ['#29506a', '#163a50', '#0f2c3e', '#7fd4ff'], fire: ['#4a2a12', '#33180a', '#ff9447'],
    c: {
      white: ['#1b2029', '#7d8799'], gray: ['#1f242d', '#8792a4'], pink: ['#3a1e29', '#ff8ea2'], orange: ['#3a2916', '#ffae5c'],
      yellow: ['#2f3018', '#e3da66'], green: ['#142e22', '#5ad08a'], blue: ['#13273c', '#5ab1ff'], purple: ['#241e3f', '#a892ff'],
      red: ['#3c1b19', '#ff786a'], teal: ['#11312f', '#4cd3c3'],
    },
  },
}

// numbers in templates are rounded to 0.1px: keeps the SVG small
const f = (n: number) => +n.toFixed(1)
const s = (str: TemplateStringsArray, ...v: unknown[]) => str.reduce((a, b, i) => a + (typeof v[i - 1] === 'number' ? f(v[i - 1] as number) : v[i - 1]) + b)
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const hex = (c: string) => { const m = c.replace('#', ''); const x = m.length === 3 ? [...m].map(k => k + k).join('') : m; return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)) }
const mix = (a: string, b: string, t: number) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('')

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  r = Math.min(r, w / 2, h / 2)
  return s`M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${2 * r - w}a${r},${r} 0 0 1 ${-r},${-r}v${2 * r - h}a${r},${r} 0 0 1 ${r},${-r}z`
}
const circ = (x: number, y: number, r: number) => s`M${x - r},${y}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0z`
const poly = (...p: number[]) => 'M' + p.map(f).join(',').replace(/([^,]*,[^,]*),/g, '$1L') + 'z'

// 3D: a fixed oblique camera. proj → [screen x, screen y, depth (larger = farther)]
const AZ = -0.65, EL = 0.45, ca = Math.cos(AZ), sa = Math.sin(AZ), ce = Math.cos(EL), se = Math.sin(EL)
const proj = (x: number, y: number, z: number): [number, number, number] => {
  const x1 = x * ca - y * sa, y1 = x * sa + y * ca
  return [x1, -z * ce - y1 * se, y1 * ce - z * se]
}
// uniform scale of projected points into a box
const fitTo = (pts: number[][], L: number, T: number, w: number, h: number, pad: number) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1))
  const ox = L + w / 2 - ((x0 + x1) / 2) * k, oy = T + h / 2 - ((y0 + y1) / 2) * k
  return (p: number[]) => [ox + p[0] * k, oy + p[1] * k]
}
// low-discrepancy (R2) sequence: even, deterministic sampling without Math.random
const r2 = (i: number): [number, number] => [(0.5 + i * 0.7548776662) % 1, (0.5 + i * 0.5698402910) % 1]
const cloud = (shape: string, n: number): number[][] =>
  Array.from({ length: n }, (_, i) => {
    const [a, b] = r2(i), u = a * 2 * Math.PI
    if (shape === 'sphere') { const z = 2 * b - 1, r = Math.sqrt(1 - z * z); return [r * Math.cos(u), r * Math.sin(u), z] }
    if (shape === 'cube') { const f = i % 6, p = 2 * a - 1, q = 2 * b - 1, s = f < 3 ? 1 : -1; return f % 3 === 0 ? [s, p, q] : f % 3 === 1 ? [p, s, q] : [p, q, s] }
    // torus, tipped toward the camera so the hole shows
    const v = b * 2 * Math.PI, R = 0.68, r = 0.3, tip = 0.8
    const x = (R + r * Math.cos(v)) * Math.cos(u), y = (R + r * Math.cos(v)) * Math.sin(u), z = r * Math.sin(v)
    return [x, y * Math.cos(tip) - z * Math.sin(tip), y * Math.sin(tip) + z * Math.cos(tip)]
  })
// a few syllables of speech: bursts of oscillation under a bumpy envelope
const utterance = (cols: number): number[][] =>
  Array.from({ length: cols }, (_, i) => {
    const t = i / cols
    const env = [[0.14, 0.9], [0.3, 0.6], [0.47, 1], [0.66, 0.75], [0.84, 0.5]].reduce((e, [c, k]) => e + k * Math.exp(-(((t - c) / 0.07) ** 2)), 0)
    const a = 0.06 + 0.9 * env * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37)))
    return [-a * (0.85 + 0.15 * Math.sin(i * 2.3)), a]
  })
const CLASSES = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'yellow']

let uid = 0

export function render(d: Diagram, theme?: string, materials = true): string {
  const th = THEMES[theme ?? d.theme] ?? THEMES.light
  const P = `mm${uid++}-`
  const horiz = d.dir === 'LR' || d.dir === 'RL', base = d.fontSize ?? FS
  const defs = new Map<string, string>()
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const box = (x: number, y: number, w = 0, h = 0) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h) }

  const pair = (c?: string): Pair => {
    if (!c) return th.none
    if (th.c[c]) return th.c[c]
    if (c[0] === '#') return [th.dark ? mix(c, '#0e1117', 0.75) : mix(c, '#ffffff', 0.78), c]
    return [c, th.edge]
  }
  const grad = (c?: string) => {
    const key = 'c-' + (c ?? 'none').replace('#', '')
    if (!defs.has(key)) {
      const [fill, stroke] = pair(c)
      const top = th.dark ? mix(fill, stroke, 0.16) : mix(fill, '#ffffff', 0.6)
      defs.set(key, s`<linearGradient id="${P}${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${fill}"/></linearGradient>`)
    }
    return `url(#${P}${key})`
  }
  const iceDefs = () => {
    if (defs.has('ice')) return
    const [a, b, c] = th.ice
    defs.set('ice', `<linearGradient id="${P}ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>` +
      `<pattern id="${P}frost" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M0 14 16 20 25 6M16 20 22 37 41 33 56 45M41 33 47 12 56 9M22 37 9 56M47 12 33 0" fill="none" stroke="#fff" stroke-opacity="${th.dark ? 0.18 : 0.75}" stroke-width="1"/><path d="M5 30 12 33M30 50 36 46M50 25 54 30" stroke="${th.ice[3]}" stroke-opacity=".35" stroke-width=".8"/></pattern>`)
  }
  const fireDefs = () => {
    if (defs.has('fire')) return
    const [a, b, c] = th.fire
    defs.set('fire', `<linearGradient id="${P}fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` +
      `<linearGradient id="${P}flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd24a"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="#e0452b"/></linearGradient>`)
  }
  // texture: explicit `texture` attr, else frozen → ice, train → magma
  const look = (n: { color?: string; flags: Set<string>; attrs: Record<string, string> }) => {
    const fx = n.attrs.texture ?? (n.flags.has('frozen') ? 'ice' : n.flags.has('train') ? 'magma' : '')
    if (fx === 'ice') { iceDefs(); return { fill: `url(#${P}ice)`, stroke: th.ice[3], fx } }
    if (fx === 'magma') { fireDefs(); return { fill: `url(#${P}fire)`, stroke: th.fire[2], fx } }
    if (fx === 'metal') return { fill: grad(n.color), stroke: th.dark ? '#9aa3ae' : '#6d747d', fx }
    return { fill: grad(n.color), stroke: pair(n.color)[1], fx }
  }

  const text = (label: string, cx: number, cy: number, size: number, weight: number, color: string, anchor: 'start' | 'middle' | 'end' = 'middle') => {
    const b = layoutLabel(label, size, weight)
    let o = '', math = ''
    b.lines.forEach((runs, i) => {
      const x = anchor === 'middle' ? cx - b.widths[i] / 2 : anchor === 'start' ? cx : cx - b.widths[i]
      const y = cy - b.h / 2 + (i + 0.5) * b.lh + size * 0.36
      for (const r of runs) {
        if (r.math) {
          const m = r.math
          math += s`<svg x="${x + r.x}" y="${y - m.asc}" width="${m.w}" height="${m.asc + m.desc}" viewBox="${m.viewBox}" overflow="visible" color="${color}">${m.inner}</svg>`
          continue
        }
        o += s`<tspan x="${x + r.x}" y="${y + r.dy}"`
        if (r.size !== size) o += s` font-size="${r.size}"`
        if (r.it) o += ' font-style="italic"'
        if (r.serif) o += ` font-family='${SERIF}' font-weight="${r.b ? 700 : 400}"`
        else if (r.b) o += ' font-weight="700"'
        o += `>${esc(r.t)}</tspan>`
      }
    })
    box(cx - (anchor === 'middle' ? b.w / 2 : anchor === 'end' ? b.w : 0), cy - b.h / 2, b.w, b.h)
    return (o ? s`<text font-size="${size}" font-weight="${weight}" fill="${color}" style="white-space:pre">${o}</text>` : '') + math
  }

  // the badge says frozen / trainable, independent of the texture
  const mark = (n: { flags: Set<string> }, fx: string) =>
    n.flags.has('frozen') ? 'ice' : n.flags.has('train') ? 'magma' : fx === 'ice' || fx === 'magma' ? fx : ''
  const badge = (fx: string, x: number, y: number) => {
    if (fx === 'ice') return s`<g transform="translate(${x},${y})"><circle r="7.5" fill="${th.dark ? '#0f2c3e' : '#fff'}" stroke="${th.ice[3]}"/><path d="M0-4.6V4.6M-4 -2.3 4 2.3M-4 2.3 4-2.3M-1.4-3.6 0-2.4 1.4-3.6M-1.4 3.6 0 2.4 1.4 3.6" fill="none" stroke="${th.ice[3]}" stroke-width="1.1" stroke-linecap="round"/></g>`
    if (fx !== 'magma') return ''
    fireDefs()
    return s`<g transform="translate(${x},${y})"><circle r="7.5" fill="${th.dark ? '#33180a' : '#fff'}" stroke="${th.fire[2]}"/><path d="M0.4-5C3 -2.4 3.9-.2 3.1 2.2 2.5 4.1-2.3 4.3-3 2.1-3.6.2-2.2-1.2-1.6-2.6-.9-1.4-.3-.9.2-.6.9-2 .9-3.5.4-5z" fill="url(#${P}flame)"/></g>`
  }
  // baked WebGL material clipped to the shape's outline; '' when unavailable
  let clips = 0
  const SHADER: Record<string, Material> = { ice: 'ice', magma: 'heat', glass: 'glass', metal: 'metal', noise: 'noise' }
  const material = (fx: string, d: string, x: number, y: number, w: number, h: number, color?: string) => {
    if (PATTERN.has(fx)) return `<path d="${d}" fill="${pattern(fx, color)}"/>`
    const url = materials && SHADER[fx] ? bake(SHADER[fx], w, h) : null
    if (!url) {
      // vector stand-ins without WebGL (ice and magma have their own below)
      if (fx === 'noise') return `<path d="${d}" fill="${pattern('grain', color)}"/>`
      if (fx === 'glass') return `<path d="${d}" fill="#fff" fill-opacity="${th.dark ? 0.12 : 0.4}"/>`
      if (fx === 'metal') return `<path d="${d}" fill="${metal()}"/>`
      return ''
    }
    const key = `m-${fx}-${Math.round(w)}x${Math.round(h)}`
    if (!defs.has(key)) defs.set(key, s`<image id="${P}${key}" width="${Math.round(w)}" height="${Math.round(h)}" preserveAspectRatio="none" href="${url}"/>`)
    const id = `${P}k${clips++}`
    return `<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">` + s`<use href="#${P}${key}" x="${x}" y="${y}"/></g>`
  }
  // crisp vector textures, one <pattern> per (kind, color)
  const PATTERN = new Set(['quantized', 'sparse', 'hatch'])
  const pattern = (kind: string, color?: string) => {
    const key = `p-${kind}-${(color ?? 'none').replace('#', '')}`
    if (!defs.has(key)) {
      const [c0, c1] = pair(color)
      let tile = 24, body = '', rot = ''
      if (kind === 'quantized') {
        // 4-level mosaic: weights snapped to a few values
        tile = 32
        ;[0, 2, 1, 3, 2, 0, 3, 1, 1, 3, 0, 2, 3, 1, 2, 0].forEach((l, i) => { body += `<rect x="${(i % 4) * 8}" y="${(i >> 2) * 8}" width="8" height="8" fill="${mix(c0, c1, (l / 3) * 0.7)}"/>` })
      } else if (kind === 'sparse') {
        // a weight grid with pruned entries missing
        ;[1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1].forEach((k, i) => { if (k) body += `<circle cx="${(i % 4) * 6 + 3}" cy="${(i >> 2) * 6 + 3}" r="1.5" fill="${c1}" fill-opacity=".75"/>` })
      } else if (kind === 'hatch') {
        tile = 7; rot = ' patternTransform="rotate(45)"'
        body = `<path d="M0 0V7" stroke="${c1}" stroke-opacity=".55" stroke-width="1.4"/>`
      } else {
        // grain: the no-WebGL stand-in for noise
        tile = 24
        for (let i = 0; i < 64; i++) body += `<rect x="${(i % 8) * 3}" y="${(i >> 3) * 3}" width="3" height="3" fill="${['#000', '#fff'][(i * 37) % 7 > 3 ? 1 : 0]}" fill-opacity="${0.08 + ((i * 53) % 11) / 40}"/>`
      }
      defs.set(key, `<pattern id="${P}${key}" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse"${rot}>${body}</pattern>`)
    }
    return `url(#${P}${key})`
  }
  const metal = () => {
    if (!defs.has('metal')) defs.set('metal', `<linearGradient id="${P}metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4e7eb"/><stop offset=".45" stop-color="#a7adb5"/><stop offset=".55" stop-color="#cfd3d8"/><stop offset="1" stop-color="#8d949d"/></linearGradient>`)
    return `url(#${P}metal)`
  }
  // frost along the top edge of a rounded rect
  const snow = (x: number, y: number, w: number, r: number) => {
    const a = x + r, b = x + w - r
    if (b - a < 8) return ''
    let p = s`M${a},${y + 1}H${b}V${y + 3.5}`
    const k = Math.max(2, Math.round((b - a) / 9)), st = (b - a) / k
    for (let i = 0; i < k; i++) p += s`q${-st / 2},${[4, 7, 3.5, 6, 5][i % 5]} ${-st},0`
    return `<path d="${p}z" fill="#fff" fill-opacity="${th.dark ? 0.55 : 0.92}"/>`
  }

  // --- images: frame geometry, and which image a magnifier looks at
  const frames = (n: Node) => {
    const [W, H] = nums(n.attrs.size, [64, 64]), k = +n.attrs.n || 1
    return {
      W, H, k, x0: n.x - (W + (k - 1) * 6) / 2, y0: n.y - (H + (k - 1) * 6) / 2,
      fit: n.attrs.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice',
      srcs: (n.attrs.srcs ? JSON.parse(n.attrs.srcs) : [n.attrs.src ?? '']) as string[],
    }
  }
  const zoomSource = (n: Node) => {
    const e = d.edges.find(e => e.to === n.id && d.nodes.get(e.from)?.shape === 'image')
    return e && d.nodes.get(e.from)
  }
  const isZoom = (e: Edge) => { const t = d.nodes.get(e.to)!; return t.shape === 'magnify' && zoomSource(t)?.id === e.from }
  const zoomRegion = (n: Node, S: Node): number[] => {
    if (n.attrs.region) return nums(n.attrs.region, [])
    const g = +S.attrs.grid || 4, [col, row] = nums(n.attrs.patch, [-1, -1])
    return col >= 0 ? [col / g, row / g, 1 / g, 1 / g] : [0.375, 0.375, 0.25, 0.25]
  }

  // --- nodes
  const drawNode = (n: Node) => {
    const L = n.x - n.w / 2, T = n.y - n.h / 2
    const { fill, stroke, fx } = look(n)
    const dash = n.flags.has('dashed') ? ' stroke-dasharray="4 3"' : ''
    const sw = n.flags.has('bold') ? 2 : 1.2
    const paint = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}`
    const ghosts = +(n.attrs.ghost ?? n.attrs.heads ?? 0)
    let baked = false
    // r: the shape's bounding box (for the material), snowy: rounded-rect radius for the snow cap
    const body = (d: string, r: number[] = [L, T, n.w, n.h], snowy = 0) => {
      let o = ''
      for (let k = Math.min(ghosts, 6) - 1; k > 0; k--)
        o += s`<path d="${d}" transform="translate(${k * 5},${-k * 5})" ${paint} opacity="${0.35 + 0.5 / (k + 1)}"/>`
      if (!th.dark || fx) o += s`<path d="${d}" transform="translate(0,1.6)" fill="${th.shadow}"/>`
      o += `<path d="${d}" ${paint}/>`
      const m = material(fx, d, r[0], r[1], r[2], r[3], n.color)
      if (m) { baked = true; o += m + `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-opacity=".7"${dash}/>` }
      else if (fx === 'ice') o += `<path d="${d}" fill="url(#${P}frost)"/>` + (snowy ? snow(r[0], r[1], r[2], snowy) : '')
      box(L, T - ghosts * 5, n.w + ghosts * 5, n.h + ghosts * 5)
      return o
    }
    let o = ''
    // text on magma needs to be light, with a dark halo to stay readable over the cracks;
    // busy textures get a halo in the page color
    const size = labelSize(n, base)
    const [ink, halo] = fx === 'metal' ? ['#1d2430', '#e8ebee'] : [th.text, th.halo] // metal is light in both themes
    const label = () => baked && fx === 'magma'
      ? `<g paint-order="stroke" stroke="#1a0d07" stroke-width="3" stroke-linejoin="round">${text(n.label, n.x, n.y, size, 600, '#fff4e8')}</g>`
      : baked && fx !== 'ice' && fx !== 'glass'
        ? `<g paint-order="stroke" stroke="${halo}" stroke-width="3" stroke-linejoin="round" stroke-opacity=".85">${text(n.label, n.x, n.y, size, 600, ink)}</g>`
        : text(n.label, n.x, n.y, size, 500, th.text)
    switch (n.shape) {
      case 'text': o = label(); break
      case 'op': {
        o = body(circ(n.x, n.y, 11), [n.x - 11, n.y - 11, 22, 22])
        const g = n.label === '+' ? s`M${n.x - 6.5},${n.y}h13M${n.x},${n.y - 6.5}v13`
          : /^[*x×]$/.test(n.label) ? s`M${n.x - 4.6},${n.y - 4.6}l9.2,9.2M${n.x + 4.6},${n.y - 4.6}l-9.2,9.2`
            : n.label === '~' ? s`M${n.x - 7},${n.y}q3.5,-8 7,0t7,0` : ''
        o += g ? `<path d="${g}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round"/>` : text(n.label, n.x, n.y, size, 500, th.text)
        break
      }
      case 'var': o = body(circ(n.x, n.y, n.w / 2), [L, T, n.w, n.h]) + label(); break
      case 'tensor': {
        const [W, H, D] = nums(n.attrs.size, [36, 64, 20]), dd = D * 0.6
        const x = L, y = T + dd, [c0, c1] = pair(n.color)
        const top = fx === 'ice' ? th.ice[0] : th.dark ? mix(c0, c1, 0.3) : mix(c0, '#fff', 0.5)
        const side = fx === 'ice' ? th.ice[2] : th.dark ? mix(c0, '#000', 0.25) : mix(c0, c1, 0.35)
        o = body(rr(x, y, W, H, 1.5), [x, y, W, H]) +
          `<path d="${poly(x, y, x + dd, y - dd, x + W + dd, y - dd, x + W, y)}" fill="${top}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>` +
          `<path d="${poly(x + W, y, x + W + dd, y - dd, x + W + dd, y + H - dd, x + W, y + H)}" fill="${side}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`
        break
      }
      case 'stack': {
        const [W, H] = nums(n.attrs.size, [44, 60]), k = +n.attrs.n || 4, off = +n.attrs.offset || 7
        for (let i = 0; i < k; i++) {
          const d = rr(L + i * off, T + i * off, W, H, 2)
          o += i === k - 1 ? body(d, [L + i * off, T + i * off, W, H]) : `<path d="${d}" ${paint}/>`
        }
        box(L, T, n.w, n.h)
        break
      }
      case 'enc': case 'dec': {
        const wide = n.shape === 'enc', q = 0.22
        const d = horiz
          ? (wide !== (d_rl()) ? poly(L, T, L + n.w, T + n.h * q, L + n.w, T + n.h * (1 - q), L, T + n.h) : poly(L, T + n.h * q, L + n.w, T, L + n.w, T + n.h, L, T + n.h * (1 - q)))
          : (wide !== (d_bt()) ? poly(L, T, L + n.w, T, L + n.w * (1 - q), T + n.h, L + n.w * q, T + n.h) : poly(L + n.w * q, T, L + n.w * (1 - q), T, L + n.w, T + n.h, L, T + n.h))
        o = body(d) + label()
        break
      }
      case 'neurons': {
        const k = +n.attrs.n || 4
        for (let i = 0; i < k; i++) {
          const t = -((k - 1) / 2) * 20 + i * 20
          { const cx = horiz ? n.x : n.x + t, cy = horiz ? n.y + t : n.y; o += body(circ(cx, cy, 7), [cx - 7, cy - 7, 14, 14]) }
        }
        break
      }
      case 'vector': {
        const vals = values(n)
        o = body(rr(L, T, n.w, n.h, 3))
        const cell = (horiz ? n.h - 4 : n.w - 4) / vals.length
        vals.forEach((v, i) => {
          const c = -((vals.length - 1) / 2) * cell + i * cell
          if (i) o += horiz ? s`<path d="M${L + 3},${n.y + c - cell / 2}h${n.w - 6}" stroke="${stroke}" stroke-opacity=".5"/>` : s`<path d="M${n.x + c - cell / 2},${T + 3}v${n.h - 6}" stroke="${stroke}" stroke-opacity=".5"/>`
          o += text(v.trim(), horiz ? n.x : n.x + c, horiz ? n.y + c : n.y, size, 500, th.text)
        })
        break
      }
      case 'image': {
        const { W, H, k, x0, y0, fit, srcs } = frames(n), gn = +n.attrs.grid || 0
        // draw the untransformed frames around the center (back to front), then tilt / rotate them there
        for (let i = 0; i < k; i++) {
          const x = x0 + i * 6, y = y0 + i * 6, d = rr(x, y, W, H, 3)
          const src = srcs.length > 1 ? srcs[k - 1 - i] : i === k - 1 ? srcs[0] : undefined
          if (!src) { o += `<path d="${d}" fill="${th.dark ? '#1b2029' : '#fff'}" stroke="${stroke}"/>`; continue }
          const id = `${P}k${clips++}`
          o += `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
            s`<image href="${esc(src)}" x="${x}" y="${y}" width="${W}" height="${H}" preserveAspectRatio="${fit}" clip-path="url(#${id})"/>`
          if (gn > 1 && i === k - 1) {
            let g = ''
            for (let j = 1; j < gn; j++) g += s`M${x + (W * j) / gn},${y}v${H}M${x},${y + (H * j) / gn}h${W}`
            o += `<path d="${g}" stroke="#fff" stroke-opacity=".9"/>`
          }
          o += `<path d="${d}" fill="none" stroke="${stroke}"/>`
        }
        const [a, b, c, dd] = imageMatrix(n.attrs)
        if (a !== 1 || b !== 0 || c !== 0 || dd !== 1)
          // coefficients keep 4 decimals; the template's 0.1px rounding is for coordinates
          o = s`<g transform="matrix(${[a, b, c, dd].map(v => v.toFixed(4)).join(' ')} ${n.x - a * n.x - c * n.y} ${n.y - b * n.x - dd * n.y})">` + o + '</g>'
        box(L, T, n.w, n.h)
        break
      }
      case 'magnify': {
        const S = zoomSource(n), R = Math.min(n.w, n.h) / 2, round = n.attrs.lens !== 'square'
        const lens = round ? circ(n.x, n.y, R) : rr(L, T, n.w, n.h, 4), id = `${P}k${clips++}`
        o += `<clipPath id="${id}"><path d="${lens}"/></clipPath>`
        if (n.attrs.src) {
          o += s`<image href="${esc(n.attrs.src)}" x="${L}" y="${T}" width="${n.w}" height="${n.h}" preserveAspectRatio="${n.attrs.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}" clip-path="url(#${id})"/>`
        } else if (S) {
          // the same <image> as the source, cropped to the region by the viewBox
          const f = frames(S), [rx, ry, rw, rh] = zoomRegion(n, S)
          o += s`<g clip-path="url(#${id})"><svg x="${L}" y="${T}" width="${n.w}" height="${n.h}" viewBox="${rx * f.W} ${ry * f.H} ${rw * f.W} ${rh * f.H}" preserveAspectRatio="xMidYMid slice">` +
            s`<image href="${esc(f.srcs[0])}" width="${f.W}" height="${f.H}" preserveAspectRatio="${f.fit}"/></svg></g>`
        } else o += `<path d="${lens}" fill="${fill}"/>`
        o += `<path d="${lens}" fill="none" stroke="${stroke}" stroke-width="2.5"/>`
        if (round) {
          // the handle of the glass, out of the lower right
          const a = R * Math.SQRT1_2
          o += s`<path d="M${n.x + a + 1},${n.y + a + 1}l${R * 0.5},${R * 0.5}" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>`
          box(n.x + a, n.y + a, R * 0.6, R * 0.6)
        }
        box(L, T, n.w, n.h)
        break
      }
      case 'gaussian': {
        const peaks: number[][] = JSON.parse(n.attrs.peaks ?? '[[0,0,1,0.45]]')
        const N = Math.min(40, +n.attrs.mesh || 16), [c0, c1] = pair(n.color)
        const height = (x: number, y: number) => peaks.reduce((a, [px, py, amp = 1, sg = 0.45]) => a + amp * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sg * sg)), 0)
        const Z = Array.from({ length: N + 1 }, (_, i) => Array.from({ length: N + 1 }, (_, j) => height(-1 + (2 * i) / N, -1 + (2 * j) / N)))
        const zmax = Math.max(...Z.flat()) || 1
        const Q = Z.map((row, i) => row.map((z, j) => proj(-1 + (2 * i) / N, -1 + (2 * j) / N, z / zmax)))
        const floor = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => proj(x, y, 0))
        const m = fitTo([...Q.flat(), ...floor], L, T, n.w, n.h, 2)
        const pt = (p: number[]) => m(p).map(f).join(',')
        o += `<path d="M${floor.map(pt).join('L')}z" fill="${c0}" fill-opacity=".5" stroke="${c1}" stroke-opacity=".4"/>`
        const quads: [number, string, number][] = []
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const q = [Q[i][j], Q[i + 1][j], Q[i + 1][j + 1], Q[i][j + 1]]
          quads.push([q.reduce((a, p) => a + p[2], 0), `M${q.map(pt).join('L')}z`, (Z[i][j] + Z[i + 1][j + 1]) / 2 / zmax])
        }
        quads.sort((a, b) => b[0] - a[0])
        for (const [, d, z] of quads) {
          const c = mix(c0, c1, 0.12 + 0.88 * z)
          o += `<path d="${d}" fill="${c}" stroke="${mix(c, th.dark ? '#ffffff' : c1, 0.35)}" stroke-width=".5"/>`
        }
        box(L, T, n.w, n.h)
        break
      }
      case 'space': {
        const [c0, c1] = pair(n.color)
        const pts: number[][] = JSON.parse(n.attrs.points ?? '[]'), axes: string[] = JSON.parse(n.attrs.axes ?? '["x","y","z"]')
        // back panes: the far x wall, the far y wall and the floor, like a matplotlib 3D axes
        const xf = proj(1, 0, 0)[2] > proj(-1, 0, 0)[2] ? 1 : -1, yf = proj(0, 1, 0)[2] > proj(0, -1, 0)[2] ? 1 : -1
        const corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => proj(x, y, z))))
        const m = fitTo(corners, L, T, n.w, n.h, 10)
        const P2 = (x: number, y: number, z: number) => m(proj(x, y, z)).map(f).join(',')
        const pane = (q: number[][]) => `<path d="M${q.map(p => P2(p[0], p[1], p[2])).join('L')}z" fill="${c0}" fill-opacity=".55" stroke="${c1}" stroke-opacity=".45" stroke-linejoin="round"/>`
        o += pane([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]) +
          pane([[xf, -1, -1], [xf, 1, -1], [xf, 1, 1], [xf, -1, 1]]) +
          pane([[-1, yf, -1], [1, yf, -1], [1, yf, 1], [-1, yf, 1]])
        let grid = ''
        for (const t of [-0.5, 0, 0.5]) grid += `M${P2(t, -1, -1)}L${P2(t, 1, -1)}M${P2(-1, t, -1)}L${P2(1, t, -1)}M${P2(xf, -1, t)}L${P2(xf, 1, t)}M${P2(-1, yf, t)}L${P2(1, yf, t)}`
        o += `<path d="${grid}" stroke="${c1}" stroke-opacity=".18"/>`
        const sorted = pts.map(p => [...p, proj(p[0], p[1], p[2])[2]]).sort((a, b) => b[b.length - 1] - a[a.length - 1])
        for (const p of sorted) {
          const [x, y] = m(proj(p[0], p[1], p[2])), c = th.c[CLASSES[(p.length > 4 ? p[3] : 0) % CLASSES.length]][1]
          o += s`<circle cx="${x}" cy="${y}" r="3.2" fill="${c}" stroke="${th.dark ? '#0e1117' : '#fff'}" stroke-width=".9"/>`
        }
        const lab = (t: string, x: number, y: number, z: number) => { const [a, b] = m(proj(x, y, z)); return text(t, a, b, base - 2, 400, th.sub) }
        // z goes beside whichever vertical edge forms the left silhouette
        const [zx, zy] = [[xf, -yf], [-xf, yf]].sort((p, q) => m(proj(p[0], p[1], 0))[0] - m(proj(q[0], q[1], 0))[0])[0]
        const [zl, zt] = m(proj(zx, zy, 0))
        o += lab(axes[0], 0, -yf * 1.22, -1) + lab(axes[1], -xf * 1.22, 0, -1) + text(axes[2], zl - 8, zt, base - 2, 400, th.sub, 'end')
        box(L, T, n.w, n.h)
        break
      }
      case 'pointcloud': {
        const [c0, c1] = pair(n.color)
        const pts: number[][] = n.attrs.points ? JSON.parse(n.attrs.points) : cloud(n.attrs.shape ?? 'torus', +n.attrs.n || 240)
        const P = pts.map(p => [...proj(p[0], p[1], p[2]), p[3]])
        const m = fitTo(P, L, T, n.w, n.h, 4)
        const ds = P.map(p => p[2]), d0 = Math.min(...ds), d1 = Math.max(...ds)
        P.sort((a, b) => b[2] - a[2]) // far first
        for (const p of P) {
          const near = (d1 - p[2]) / (d1 - d0 || 1), [x, y] = m(p)
          const c = p[3] !== undefined ? th.c[CLASSES[p[3] % CLASSES.length]][1] : mix(c0, c1, 0.3 + 0.7 * near)
          o += s`<circle cx="${x}" cy="${y}" r="${1 + 1.4 * near}" fill="${c}" fill-opacity="${0.5 + 0.5 * near}"/>`
        }
        box(L, T, n.w, n.h)
        break
      }
      case 'waveform': {
        o = body(rr(L, T, n.w, n.h, 6))
        const cols: number[][] = n.attrs.wave ? JSON.parse(n.attrs.wave) : utterance(72)
        const pad = 6, cy = n.y, hh = n.h / 2 - pad, dx = (n.w - 2 * pad) / cols.length
        let path = ''
        cols.forEach(([lo, hi], i) => {
          const x = L + pad + dx * (i + 0.5)
          path += s`M${x},${cy - Math.max(hi, 0.02) * hh}V${cy - Math.min(lo, -0.02) * hh}`
        })
        o += `<path d="${path}" stroke="${stroke}" stroke-width="${f(Math.max(0.8, dx * 0.6))}" stroke-linecap="round"/>`
        break
      }
      case 'sphere': {
        const [c0, c1] = pair(n.color), R = Math.min(n.w, n.h) / 2 - 2, key = 'sph-' + (n.color ?? 'none').replace('#', '')
        if (!defs.has(key)) defs.set(key, `<radialGradient id="${P}${key}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${th.dark ? mix(c0, c1, 0.35) : '#ffffff'}"/><stop offset=".55" stop-color="${c0}"/><stop offset="1" stop-color="${mix(c0, c1, 0.35)}"/></radialGradient>`)
        o += s`<circle cx="${n.x}" cy="${n.y}" r="${R}" fill="url(#${P}${key})" stroke="${c1}"/>`
        let front = '', back = ''
        const curve = (at: (t: number) => number[]) => {
          let prev: boolean | undefined
          for (let i = 0; i <= 64; i++) {
            const [a, b, dz] = proj(...(at((i / 64) * Math.PI * 2) as [number, number, number])), vis = dz <= 0
            const seg = (vis === prev ? 'L' : 'M') + f(n.x + a * R) + ',' + f(n.y + b * R)
            if (vis) front += seg; else back += seg
            prev = vis
          }
        }
        for (const z of [-0.5, 0, 0.5]) { const r = Math.sqrt(1 - z * z); curve(t => [r * Math.cos(t), r * Math.sin(t), z]) }
        for (const lon of [0, Math.PI / 3, (2 * Math.PI) / 3]) curve(t => [Math.cos(t) * Math.cos(lon), Math.cos(t) * Math.sin(lon), Math.sin(t)])
        o += `<path d="${back}" fill="none" stroke="${c1}" stroke-opacity=".22" stroke-dasharray="2 2"/><path d="${front}" fill="none" stroke="${c1}" stroke-opacity=".55"/>`
        const pts: number[][] = JSON.parse(n.attrs.points ?? '[]')
        for (const p of pts) {
          const l = Math.hypot(p[0], p[1], p[2]) || 1, [a, b, dz] = proj(p[0] / l, p[1] / l, p[2] / l)
          const c = th.c[CLASSES[(p[3] ?? 0) % CLASSES.length]][1]
          o += s`<circle cx="${n.x + a * R}" cy="${n.y + b * R}" r="3" fill="${c}" stroke="${th.dark ? '#0e1117' : '#fff'}" stroke-width=".8" opacity="${dz <= 0 ? 1 : 0.3}"/>`
        }
        box(L, T, n.w, n.h)
        break
      }
      default: {
        const r = n.shape === 'thin' ? 5 : 7
        o = body(rr(L, T, n.w, n.h, r), undefined, r) + label()
      }
    }
    if (OUTSIDE.has(n.shape) && n.label) o += text(n.label, n.x, T - (ghosts * 5) - 11, size, 500, th.sub)
    if (n.attrs.caption) o += text(n.attrs.caption, n.x, n.y + n.h / 2 + 12, base - 1, 400, th.sub)
    const b = mark(n, fx)
    if (b) {
      const round = n.shape === 'op' || n.shape === 'var'
      o += round ? badge(b, n.x + n.w * 0.36, n.y - n.h * 0.36) : badge(b, L + n.w - 2, T + 2)
    }
    if (n.flags.has('crossed')) {
      // dim the block and strike it through; round shapes get the ✕ inside the circle
      const k = n.shape === 'op' || n.shape === 'var' ? n.w * 0.15 : 3
      o = `<g opacity=".5">${o}</g>` + cross(L + k, T + k, L + n.w - k, T + n.h - k, 2.2)
    }
    return `<g>${o}</g>`
  }
  // ✕ from (x0,y0) to (x1,y1), with a halo so it reads on any fill
  const cross = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const d = s`M${x0},${y0}L${x1},${y1}M${x1},${y0}L${x0},${y1}`, c = th.c.red[1]
    return `<path d="${d}" stroke="${th.halo}" stroke-width="${w + 2.5}" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`
  }
  const d_rl = () => d.dir === 'RL', d_bt = () => d.dir === 'BT'

  // --- edges
  const drawEdge = (e: Edge) => {
    if (isZoom(e)) return '' // drawn as zoom lines
    const color = e.attrs.color ? pair(e.attrs.color)[1] : th.edge
    if (e.fc) return fc(e, color)
    const p = e.pts.map(q => [...q] as [number, number])
    if (p.length < 2) return ''
    const thick = e.op === '=>' || e.flags.has('thick')
    const dashed = e.op.startsWith('..') || e.flags.has('dashed')
    const heads = e.op === '--' || e.op === '..' ? 0 : e.op === '<->' ? 2 : 1
    const AL = thick ? 9 : 7.5, AW = thick ? 4.2 : 3.4
    let o = ''
    const head = (tip: number[], from: number[]): [number, number] => {
      const dx = tip[0] - from[0], dy = tip[1] - from[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l
      const bx = tip[0] - ux * AL, by = tip[1] - uy * AL
      o += `<path d="${poly(tip[0], tip[1], bx - uy * AW, by + ux * AW, tip[0] - ux * AL * 0.72, tip[1] - uy * AL * 0.72, bx + uy * AW, by - ux * AW)}" fill="${color}"/>`
      return [tip[0] - ux * AL * 0.7, tip[1] - uy * AL * 0.7]
    }
    for (const q of p) box(q[0] - 2, q[1] - 2, 4, 4)
    let d: string
    if (e.curve) {
      const [a, b, c, z] = p, k = e.curve
      const c1 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], c2 = [z[0] + (c[0] - z[0]) * k, z[1] + (c[1] - z[1]) * k]
      const end = heads ? head(z, c2) : z, start = heads === 2 ? head(a, c1) : a
      d = s`M${start[0]},${start[1]}C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`
    } else {
      if (heads) p[p.length - 1] = head(p[p.length - 1], p[p.length - 2])
      if (heads === 2) p[0] = head(p[0], p[1])
      d = s`M${p[0][0]},${p[0][1]}`
      for (let i = 1; i < p.length - 1; i++) {
        const [a, b, c] = [p[i - 1], p[i], p[i + 1]]
        const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
        const r = Math.min(8, l1 / 2, l2 / 2)
        d += s`L${b[0] + (a[0] - b[0]) * r / (l1 || 1)},${b[1] + (a[1] - b[1]) * r / (l1 || 1)}Q${b[0]},${b[1]} ${b[0] + (c[0] - b[0]) * r / (l2 || 1)},${b[1] + (c[1] - b[1]) * r / (l2 || 1)}`
      }
      d += s`L${p[p.length - 1][0]},${p[p.length - 1][1]}`
    }
    if (e.flags.has('crossed')) {
      // ✕ at the middle of the longest segment
      let bi = 0, best = -1
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const l = Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1])
        if (l > best) { best = l; bi = i }
      }
      const mx = (e.pts[bi][0] + e.pts[bi + 1][0]) / 2, my = (e.pts[bi][1] + e.pts[bi + 1][1]) / 2
      o += cross(mx - 5, my - 5, mx + 5, my + 5, 2)
    }
    return s`<path d="${d}" fill="none" stroke="${color}" stroke-width="${thick ? 2.2 : 1.4}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 4"' : ''}/>` + o
  }
  const centers = (n: Node) => {
    const k = +n.attrs.n || 4
    return Array.from({ length: k }, (_, i) => { const t = -((k - 1) / 2) * 20 + i * 20; return horiz ? [n.x, n.y + t] : [n.x + t, n.y] })
  }
  const fc = (e: Edge, color: string) => {
    let d = ''
    for (const [ax, ay] of centers(d_node(e.from))) for (const [bx, by] of centers(d_node(e.to))) {
      const l = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / l, uy = (by - ay) / l
      d += s`M${ax + ux * 7},${ay + uy * 7}L${bx - ux * 7},${by - uy * 7}`
    }
    return `<path d="${d}" stroke="${color}" stroke-opacity=".45" stroke-width=".8"/>`
  }
  const d_node = (id: string) => d.nodes.get(id)!

  // --- groups
  const drawGroup = (g: Group) => {
    if (!g.w) return ''
    const { fill, stroke, fx } = g.attrs.texture || g.flags.has('frozen') || g.flags.has('train') ? look(g) : { fill: g.attrs.color ? pair(g.attrs.color)[0] : th.group[0], stroke: g.attrs.color ? pair(g.attrs.color)[1] : th.group[1], fx: '' }
    const dash = g.flags.has('dashed') ? ' stroke-dasharray="5 4"' : ''
    const d = rr(g.x, g.y, g.w, g.h, 12)
    let o = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${dash}/>`
    const m = material(fx, d, g.x, g.y, g.w, g.h, g.attrs.color)
    if (m) o += m + `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-opacity=".7"/>`
    else if (fx === 'ice') o += `<path d="${d}" fill="url(#${P}frost)"/>` + snow(g.x, g.y, g.w, 12)
    box(g.x, g.y, g.w, g.h)
    if (g.label) o += text(g.label, g.x + 12, g.y + 13, base - 2, 600, th.sub, 'start')
    if (g.attrs.repeat) {
      const [x, y, anchor] = repeatAt(g)
      o += text(g.attrs.repeat, x, y, base + 2, 500, th.text, anchor)
    }
    o += badge(mark(g, fx), g.x + g.w - 2, g.y + 2)
    return o
  }

  const ns = [...d.nodes.values()]
  const cx = ns.reduce((a, n) => a + n.x, 0) / (ns.length || 1)

  // --- where a group's "N×" goes. A side is a candidate box next to the group; 'auto'
  // tries the outer side, below, the inner side, above (centered first, then the
  // left/right sides off-center) and takes the first box that touches nothing.
  type Box = [number, number, number, number]
  const hits = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
  const taken: Box[] = []
  const obstacles = (g: Group) => {
    const lineage = new Set<string>()
    for (let p: Group | undefined = g; p; p = d.groups.find(q => q.id === p!.parent)) lineage.add(p.id)
    const bs: Box[] = ns.map(n => [n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2 + (n.attrs.caption ? 20 : 0)])
    for (const e of d.edges) {
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const [a, b] = [e.pts[i], e.pts[i + 1]]
        bs.push([Math.min(a[0], b[0]) - 2, Math.min(a[1], b[1]) - 2, Math.max(a[0], b[0]) + 2, Math.max(a[1], b[1]) + 2])
      }
      if (e.label && e.lx !== undefined) {
        const t = layoutLabel(e.label, base - 1)
        bs.push([e.lx - t.w / 2, e.ly! - t.h / 2, e.lx + t.w / 2, e.ly! + t.h / 2])
      }
    }
    // other groups' boxes (not this one, its parents or its children)
    for (const q of d.groups) if (q.w && !lineage.has(q.id) && q.parent !== g.id) bs.push([q.x, q.y, q.x + q.w, q.y + q.h])
    return [...bs, ...taken]
  }
  const repeatAt = (g: Group): [number, number, 'start' | 'middle' | 'end'] => {
    const t = layoutLabel(g.attrs.repeat, base + 2, 500), gap = 10
    const at = {
      left: (f = 0.5): [number, number, 'end'] => [g.x - gap, g.y + g.h * f, 'end'],
      right: (f = 0.5): [number, number, 'start'] => [g.x + g.w + gap, g.y + g.h * f, 'start'],
      top: (): [number, number, 'middle'] => [g.x + g.w / 2, g.y - gap - t.h / 2, 'middle'],
      bottom: (): [number, number, 'middle'] => [g.x + g.w / 2, g.y + g.h + gap + t.h / 2, 'middle'],
    }
    const area = ([x, y, a]: [number, number, string]): Box =>
      [a === 'end' ? x - t.w : a === 'middle' ? x - t.w / 2 : x, y - t.h / 2, a === 'start' ? x + t.w : a === 'middle' ? x + t.w / 2 : x, y + t.h / 2]
    const outer = g.x + g.w / 2 > cx ? 'right' : 'left', inner = outer === 'right' ? 'left' : 'right'
    const side = g.attrs['repeat-side'] as keyof typeof at | 'auto' | undefined
    let pick = side && side !== 'auto' ? at[side]() : undefined
    if (!pick) {
      const cands = [at[outer](), at.bottom(), at[inner](), at.top(), ...[0.25, 0.75].flatMap(f => [at[outer](f), at[inner](f)])]
      const bs = obstacles(g)
      pick = cands.find(c => !bs.some(b => hits(area(c), b))) ?? cands[0]
    }
    taken.push(area(pick))
    return pick
  }
  // zoom lines: the region's outline on the source image, and two lines out to the lens
  const zooms = ns.filter(n => n.shape === 'magnify').map(n => {
    const S = zoomSource(n)
    if (!S) return ''
    const fr = frames(S), [rx, ry, rw, rh] = zoomRegion(n, S), [a, b, c, dd] = imageMatrix(S.attrs)
    const fx = fr.x0 + (fr.k - 1) * 6, fy = fr.y0 + (fr.k - 1) * 6 // front frame
    const at = (u: number, v: number) => {
      const px = fx + u * fr.W - S.x, py = fy + v * fr.H - S.y
      return [S.x + a * px + c * py, S.y + b * px + dd * py]
    }
    const reg = [at(rx, ry), at(rx + rw, ry), at(rx + rw, ry + rh), at(rx, ry + rh)]
    const [cx, cy] = reg.reduce((p, q) => [p[0] + q[0] / 4, p[1] + q[1] / 4], [0, 0])
    const l = Math.hypot(n.x - cx, n.y - cy) || 1, px = -(n.y - cy) / l, py = (n.x - cx) / l // across the zoom direction
    const along = (p: number[]) => p[0] * px + p[1] * py
    const sorted = [...reg].sort((p, q) => along(p) - along(q))
    const R = Math.min(n.w, n.h) / 2
    const lens = n.attrs.lens === 'square'
      ? [[n.x - n.w / 2, n.y - n.h / 2], [n.x + n.w / 2, n.y - n.h / 2], [n.x + n.w / 2, n.y + n.h / 2], [n.x - n.w / 2, n.y + n.h / 2]].sort((p, q) => along(p) - along(q))
      : [[n.x - px * R, n.y - py * R], [n.x + px * R, n.y + py * R]]
    const [lo, hi] = [lens[0], lens[lens.length - 1]], stroke = pair(n.color)[1]
    return `<path d="M${reg.map(p => p.map(f).join(',')).join('L')}z" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M${sorted[0].map(f)}L${lo.map(f)}M${sorted[3].map(f)}L${hi.map(f)}" stroke="${stroke}" stroke-opacity=".75" stroke-dasharray="3 3"/>`
  }).join('')
  const groups = d.groups.map(drawGroup).join('')
  const edges = d.edges.map(drawEdge).join('')
  const nodes = [...d.nodes.values()].map(drawNode).join('')
  const labels = d.edges.filter(e => e.label && e.lx !== undefined)
    .map(e => text(e.label!, e.lx!, e.ly!, base - 1, 400, th.sub)).join('')
  if (x0 === Infinity) x0 = y0 = x1 = y1 = 0
  const m = 14, W = x1 - x0 + m * 2, H = y1 - y0 + m * 2
  const bg = th.bg !== 'none' ? s`<rect x="${x0 - m}" y="${y0 - m}" width="${W}" height="${H}" rx="10" fill="${th.bg}"/>` : ''
  return s`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - m} ${y0 - m} ${W} ${H}" width="${W}" height="${H}" font-family='${SANS}' style="max-width:100%;height:auto" role="img">` +
    `<defs>${[...defs.values()].join('')}</defs>${bg}<g>${groups}</g><g>${edges}</g><g>${nodes}</g><g>${zooms}</g><g paint-order="stroke" stroke="${th.halo}" stroke-width="4" stroke-linejoin="round">${labels}</g></svg>`
}
