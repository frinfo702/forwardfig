import type { Diagram, Edge, Node } from './types'
import { REGULAR, SANS, layoutLabel } from './tex'

// Layout = a grid. Main axis: rank (longest path). Cross axis: lane (a node inherits
// its first predecessor's lane, so chains stay perfectly straight). Edges are
// orthogonal: straight, one Z bend in the gap before the target, or a bracket
// around obstacles. No splines, no force simulation.

export const FS = 13
export const OUTSIDE = new Set(['tensor', 'stack', 'matrix', 'voxels', 'image', 'magnify', 'neurons', 'gaussian', 'space', 'sphere', 'pointcloud', 'waveform', 'plot'])
export const values = (n: Node): string[] => JSON.parse(n.attrs.values ?? '[]')
/** label size of a block: its own fontSize, else derived from the figure's base size */
export const labelSize = (n: Node, base: number) =>
  +n.attrs.fontSize || (n.shape === 'thin' || n.shape === 'vector' || OUTSIDE.has(n.shape) ? base - 1 : base)
/**
 * Linear part [a, b, c, d] of an image's transform (x' = a·x + c·y, y' = b·x + d·y).
 * tilt: turn around the vertical axis, drawn obliquely (x shrinks, the far side rises,
 * as depth does in an oblique drawing);
 * rotate: in-plane. Both in degrees.
 */
export const imageMatrix = (attrs: Record<string, string>): [number, number, number, number] => {
  const t = ((+attrs.tilt || 0) * Math.PI) / 180, r = ((+attrs.rotate || 0) * Math.PI) / 180
  const [ta, tb] = [Math.cos(t), -Math.sin(t) * 0.35], [cr, sr] = [Math.cos(r), Math.sin(r)]
  return [cr * ta - sr * tb, sr * ta + cr * tb, -sr, cr]
}
export const nums = (s: string | undefined, def: number[]) => (s ? s.split(',').map(Number) : def)
const REL: Record<string, [number, number]> = { 'left-of': [-1, 0], 'right-of': [1, 0], above: [0, -1], below: [0, 1] }
const GP = 14 // group padding

type V = [number, number]
type R = { u: number; v: number; hu: number; hv: number }
export type Box = [number, number, number, number]
export const hits = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

function size(n: Node, horiz: boolean, base: number, family: string) {
  const fs = labelSize(n, base), ff = n.attrs.fontFamily || family, lb = layoutLabel(n.label, fs, 500, ff)
  let w: number, h: number
  switch (n.shape) {
    case 'thin': w = Math.max(lb.w + 26, 64); h = lb.h + 9; break
    case 'op': w = h = 22; break
    case 'circle': w = h = Math.max(42, lb.w + 18, lb.h + 16); break
    case 'tensor': { const [W, H, D] = nums(n.attrs.size, [36, 64, 20]); w = W + D * 0.6; h = H + D * 0.6; break }
    case 'stack': { const [W, H] = nums(n.attrs.size, [44, 60]); const k = +n.attrs.n || 4, o = +n.attrs.offset || 7; w = W + (k - 1) * o; h = H + (k - 1) * o; break }
    case 'enc': case 'dec':
      if (horiz) { w = lb.w + 40; h = Math.max(84, lb.h + 44) } else { w = Math.max(lb.w + 64, 120); h = Math.max(52, lb.h + 26) }
      break
    case 'neurons': { const c = (+n.attrs.n || 4) * 20 + 4; [w, h] = horiz ? [22, c] : [c, 22]; break }
    case 'vector': {
      const vals = values(n)
      const cw = Math.max(36, ...vals.map(v => layoutLabel(v.trim(), fs, REGULAR, ff).w + 14))
      const ch = Math.max(20, fs + 8)
      ;[w, h] = horiz ? [cw, vals.length * ch + 4] : [vals.length * cw + 4, ch + 2]
      break
    }
    case 'image': {
      const [W, H] = nums(n.attrs.size, [64, 64]), k = +n.attrs.n || 1, bw = W + (k - 1) * 6, bh = H + (k - 1) * 6
      // the layout box is the transformed frame's bounding box
      const [a, b, c, d] = imageMatrix(n.attrs)
      w = Math.abs(a) * bw + Math.abs(c) * bh
      h = Math.abs(b) * bw + Math.abs(d) * bh
      break
    }
    case 'magnify': [w, h] = nums(n.attrs.size, [64, 64]); break
    case 'matrix': { const k = +n.attrs.cellSize || 16; w = +n.attrs.cols * k; h = +n.attrs.rows * k; break }
    case 'voxels': { const k = +n.attrs.cellSize || 16, dz = +n.attrs.depth * k * 0.5; w = +n.attrs.cols * k + dz; h = +n.attrs.rows * k + dz; break }
    case 'gaussian': [w, h] = nums(n.attrs.size, [120, 84]); break
    case 'space': [w, h] = nums(n.attrs.size, [110, 100]); break
    case 'sphere': [w, h] = nums(n.attrs.size, [84, 84]); break
    case 'pointcloud': [w, h] = nums(n.attrs.size, [100, 84]); break
    case 'waveform': [w, h] = nums(n.attrs.size, [120, 44]); break
    case 'plot': [w, h] = nums(n.attrs.size, [120, 84]); break
    case 'text': w = lb.w + 8; h = lb.h + 4; break
    case 'empty': w = h = 0; break
    default: w = Math.max(lb.w + 30, 76); h = lb.h + 18
  }
  n.w = +n.attrs.w || w
  n.h = +n.attrs.h || h
}

export function layout(d: Diagram) {
  const horiz = d.dir === 'LR' || d.dir === 'RL'
  const [gapM, gapC] = d.gap ?? (horiz ? [56, 36] : [30, 44])
  const nodes = [...d.nodes.values()]
  const base = d.fontSize ?? FS, family = d.fontFamily ?? SANS
  for (const n of nodes) size(n, horiz, base, family)
  const M = (n: Node) => (horiz ? n.w : n.h), C = (n: Node) => (horiz ? n.h : n.w)
  const toS = (u: number, v: number): V => (d.dir === 'TB' ? [v, u] : d.dir === 'BT' ? [v, -u] : d.dir === 'LR' ? [u, v] : [-u, v])
  const toA = (x: number, y: number): V => (d.dir === 'TB' ? [y, x] : d.dir === 'BT' ? [-y, x] : d.dir === 'LR' ? [x, y] : [-x, y])
  const isFree = (n: Node) => 'at' in n.attrs || Object.keys(REL).some(k => k in n.attrs)
  const laid = nodes.filter(n => !isFree(n))
  const inGrid = new Set(laid.map(n => n.id))

  // --- ranks: merge `rank a b` sets, drop DFS back edges, longest path
  const rep = new Map(laid.map(n => [n.id, n.id]))
  const find = (id: string) => { while (rep.get(id) !== id) id = rep.get(id)!; return id }
  for (const set of d.ranks) for (const id of set.slice(1)) if (inGrid.has(id) && inGrid.has(set[0])) rep.set(find(id), find(set[0]))
  const out = new Map<string, { to: string; e: Edge }[]>()
  for (const e of d.edges) {
    if (!inGrid.has(e.from) || !inGrid.has(e.to)) continue
    const a = find(e.from), b = find(e.to)
    if (a === b) continue
    if (!out.has(a)) out.set(a, [])
    out.get(a)!.push({ to: b, e })
  }
  // back edges: take edges in the order they were drawn and drop each one that would close a
  // cycle, so the flow written first wins and a column folded back with `rank` is what runs back
  // ponytail: a reachability search per edge, O(E·(V+E)); fine at figure sizes
  const back = new Set<Edge>(), dag = new Map<string, string[]>()
  const reaches = (from: string, to: string) => {
    const seen = new Set([from]), todo = [from]
    while (todo.length) {
      const a = todo.pop()!
      if (a === to) return true
      for (const b of dag.get(a) ?? []) if (!seen.has(b)) { seen.add(b); todo.push(b) }
    }
    return false
  }
  for (const e of d.edges) {
    if (!inGrid.has(e.from) || !inGrid.has(e.to)) continue
    const a = find(e.from), b = find(e.to)
    if (a === b) continue
    if (reaches(b, a)) { back.add(e); continue }
    if (!dag.has(a)) dag.set(a, [])
    dag.get(a)!.push(b)
  }
  const state = new Map<string, number>(), post: string[] = []
  const dfs = (a: string) => {
    state.set(a, 1)
    for (const { to, e } of out.get(a) ?? []) if (!back.has(e) && !state.get(to)) dfs(to)
    state.set(a, 2)
    post.push(a)
  }
  for (const n of laid) if (!state.has(find(n.id))) dfs(find(n.id))
  const rank = new Map<string, number>()
  for (const a of post.reverse()) {
    const ra = rank.get(a) ?? 0
    rank.set(a, ra)
    for (const { to, e } of out.get(a) ?? []) if (!back.has(e)) rank.set(to, Math.max(rank.get(to) ?? 0, ra + 1))
  }
  const rk = (n: Node) => rank.get(find(n.id))!

  // --- lanes
  const preds = new Map<string, Node[]>()
  for (const e of d.edges)
    // side taps (join) and skips feed a block without deciding its column
    if (inGrid.has(e.from) && inGrid.has(e.to) && !back.has(e) && !e.flags.has('skip') && !e.flags.has('join')) {
      if (!preds.has(e.to)) preds.set(e.to, [])
      preds.get(e.to)!.push(d.nodes.get(e.from)!)
    }
  const lane = new Map<string, number>(), claimed = new Set<string>(), occ = new Set<string>()
  let next = 0
  for (const n of [...laid].sort((a, b) => rk(a) - rk(b) || a.order - b.order)) {
    const r = rk(n), free = (l: number) => !occ.has(r + ':' + l)
    let l: number | undefined = n.attrs.lane !== undefined ? +n.attrs.lane : n.attrs.align ? lane.get(n.attrs.align) : undefined
    if (l === undefined) {
      const ps = (preds.get(n.id) ?? []).filter(p => rk(p) < r)
      const ls = ps.map(p => lane.get(p.id)!)
      if (ps.length > 1 && ps.every(p => rk(p) === rk(ps[0])) && new Set(ls).size === ls.length) {
        const m = ls.reduce((a, b) => a + b) / ls.length
        if (free(m)) l = m
      } else for (const p of ps) {
        const pl = lane.get(p.id)!
        if (!claimed.has(p.id) && free(pl)) { l = pl; claimed.add(p.id); break }
      }
      // fed only by back edges (a column flowing against the flow): take the lane of what it feeds
      if (l === undefined && !ps.length) for (const e of d.edges) {
        if (e.from !== n.id || !back.has(e) || !lane.has(e.to) || claimed.has(e.to)) continue
        const tl = lane.get(e.to)!
        if (free(tl)) { l = tl; claimed.add(e.to); break }
      }
    }
    if (l === undefined || !free(l)) { while (!free(next)) next++; l = next }
    next = Math.max(next, Math.floor(l) + 1)
    occ.add(r + ':' + l)
    lane.set(n.id, l)
  }
  // a negative `lane` adds columns before lane 0: shift everything so lanes start at 0
  const shift = -Math.floor(Math.min(0, ...lane.values()))
  if (shift) { for (const [id, l] of lane) lane.set(id, l + shift); next += shift }

  // --- crossings: swap neighbouring lanes (whole columns, so chains stay straight) while that
  // strictly lowers the count. Lanes with an explicit `lane` or a block between lanes stay put,
  // and no swap may put a block inside a group it is not in.
  // ponytail: greedy adjacent swaps stop at a local minimum; barycenter sweeps if figures need more
  const rkOf = (id: string) => rk(d.nodes.get(id)!)
  const ge = d.edges.filter(e => inGrid.has(e.from) && inGrid.has(e.to) && !back.has(e) && !e.flags.has('skip') && rkOf(e.from) < rkOf(e.to))
  // an edge runs down its source's lane and bends just before its target's rank
  const at = (e: Edge, r: number) => lane.get(r < rkOf(e.to) ? e.from : e.to)!
  const crossings = () => {
    let c = 0
    for (let i = 0; i < ge.length; i++)
      for (let j = i + 1; j < ge.length; j++) {
        const a = ge[i], b = ge[j], lo = Math.max(rkOf(a.from), rkOf(b.from)), hi = Math.min(rkOf(a.to), rkOf(b.to))
        if (lo < hi && (at(a, lo) - at(b, lo)) * (at(a, hi) - at(b, hi)) < 0) c++
      }
    return c
  }
  const intruders = () => {
    let c = 0
    for (const g of d.groups) {
      const mem = laid.filter(n => n.groups.includes(g.id))
      if (!mem.length) continue
      const ls = mem.map(n => lane.get(n.id)!), rs = mem.map(rk)
      for (const n of laid) {
        const l = lane.get(n.id)!, r = rk(n)
        if (!n.groups.includes(g.id) && l >= Math.min(...ls) && l <= Math.max(...ls) && r >= Math.min(...rs) && r <= Math.max(...rs)) c++
      }
    }
    return c
  }
  const fixed = new Set<number>()
  for (const n of laid) {
    const l = lane.get(n.id)!
    if (n.attrs.lane !== undefined) fixed.add(l)
    if (!Number.isInteger(l)) fixed.add(Math.floor(l)).add(Math.ceil(l))
  }
  const swap = (i: number) => { for (const [id, l] of lane) if (l === i || l === i + 1) lane.set(id, 2 * i + 1 - l) }
  let best = crossings(), bad = best ? intruders() : 0
  for (let pass = 0, better = true; best && better && pass < next; pass++) {
    better = false
    for (let i = 0; i + 1 < next && best; i++) {
      if (fixed.has(i) || fixed.has(i + 1)) continue
      swap(i)
      const c = crossings(), b = c < best ? intruders() : Infinity
      if (b <= bad) { best = c; bad = b; better = true } else swap(i)
    }
  }

  // --- coordinates: lane/rank sizes, extra room where group membership changes
  const nl = Math.max(0, ...[...lane.values()].map(Math.ceil)) + 1
  const nr = Math.max(0, ...laid.map(rk)) + 1
  const lw = Array(nl).fill(0), rs = Array(nr).fill(0)
  const lg: Set<string>[] = Array.from({ length: nl }, () => new Set()), rg: Set<string>[] = Array.from({ length: nr }, () => new Set())
  for (const n of laid) {
    const l = lane.get(n.id)!, r = rk(n), sig = n.groups.join()
    if (Number.isInteger(l)) { lw[l] = Math.max(lw[l], C(n)); lg[l].add(sig) }
    rs[r] = Math.max(rs[r], M(n))
    n.groups.forEach(g => rg[r].add(g))
  }
  const differ = (a: Set<string>, b: Set<string>) => a.size !== b.size || [...a].some(x => !b.has(x))
  // labelled edges widen the gap they sit in
  const need = Array(nr).fill(gapM)
  for (const e of d.edges) {
    const a = d.nodes.get(e.from)!, b = d.nodes.get(e.to)!
    if (!e.label || !inGrid.has(a.id) || !inGrid.has(b.id) || rk(b) <= rk(a)) continue
    const lb = layoutLabel(e.label, base - 1, REGULAR, family)
    need[rk(b)] = Math.max(need[rk(b)], horiz ? lb.w + 24 : lb.h + 16)
  }
  const lp = [lw[0] / 2], rp = [rs[0] / 2]
  for (let i = 1; i < nl; i++) lp[i] = lp[i - 1] + lw[i - 1] / 2 + gapC + (differ(lg[i - 1], lg[i]) ? GP * 2 : 0) + lw[i] / 2
  for (let i = 1; i < nr; i++) rp[i] = rp[i - 1] + rs[i - 1] / 2 + need[i] + (differ(rg[i - 1], rg[i]) ? GP * 1.5 : 0) + rs[i] / 2
  const vOf = (l: number) => { const a = Math.floor(l), b = Math.ceil(l); return lp[a] + (lp[b] - lp[a]) * (l - a) }
  const nudge = (n: Node) => { const [dx, dy] = nums(n.attrs.nudge, [0, 0]); n.x += dx; n.y += dy }
  for (const n of laid) { [n.x, n.y] = toS(rp[rk(n)], vOf(lane.get(n.id)!)); nudge(n) }

  // free nodes: at=x,y (screen px) or left-of/right-of/above/below=<id>
  let pending = nodes.filter(isFree)
  const placed = new Set(inGrid)
  for (let pass = 0; pending.length && pass <= nodes.length; pass++)
    pending = pending.filter(n => {
      if (n.attrs.at) { [n.x, n.y] = nums(n.attrs.at, [0, 0]); nudge(n); placed.add(n.id); return false }
      const k = Object.keys(REL).find(k => k in n.attrs)!
      const t = d.nodes.get(n.attrs[k])
      if (!t) throw new Error(`${n.id}: ${k} refers to unknown node "${n.attrs[k]}"`)
      if (!placed.has(t.id)) return true
      const [dx, dy] = REL[k], g = +n.attrs.dist || 22
      n.x = t.x + dx * (t.w / 2 + n.w / 2 + g)
      n.y = t.y + dy * (t.h / 2 + n.h / 2 + g)
      nudge(n)
      placed.add(n.id)
      return false
    })
  if (pending.length) throw new Error(`circular placement: ${pending.map(n => n.id).join(', ')}`)

  // --- routing (abstract coords: u along flow, v across)
  const rc = new Map<string, R>()
  for (const n of nodes) { const [u, v] = toA(n.x, n.y); rc.set(n.id, { u, v, hu: M(n) / 2, hv: C(n) / 2 }) }
  const hit = (pts: V[], s: string, t: string) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]]
      const u0 = Math.min(a[0], b[0]), u1 = Math.max(a[0], b[0]), v0 = Math.min(a[1], b[1]), v1 = Math.max(a[1], b[1])
      for (const [id, r] of rc)
        if (id !== s && id !== t && u0 < r.u + r.hu + 3 && u1 > r.u - r.hu - 3 && v0 < r.v + r.hv + 3 && v1 > r.v - r.hv - 3) return true
    }
    return false
  }
  const chans: { side: number; a: number; b: number; v: number }[] = []
  // first free line beside everything that sits in the corridor [lo, hi] over u ∈ (a, b)
  const channel = (side: number, a: number, b: number, lo: number, hi: number) => {
    let v = side > 0 ? hi : lo
    for (let changed = true; changed;) {
      changed = false
      for (const r of rc.values())
        if (r.u - r.hu < b && r.u + r.hu > a && r.v + r.hv > lo - 1 && r.v - r.hv < hi + 1) {
          const edge = side > 0 ? r.v + r.hv : r.v - r.hv
          if (side > 0 ? edge > v : edge < v) { v = edge; changed = true; side > 0 ? (hi = v) : (lo = v) }
        }
    }
    v += side * 16
    for (let again = true; again;) {
      again = false
      for (const c of chans) if (c.side === side && c.a < b && c.b > a && Math.abs(c.v - v) < 9) { v += side * 9; again = true }
    }
    chans.push({ side, a, b, v })
    return v
  }

  type Plan = { e: Edge; S: R; T: R; ps: number; pt: number; alt?: V[] }
  const direct: Plan[] = [], rest: Edge[] = []
  for (const e of d.edges) {
    const S = rc.get(e.from)!, T = rc.get(e.to)!
    const a = d.nodes.get(e.from)!, b = d.nodes.get(e.to)!
    if (e.op === '=>' && a.shape === 'neurons' && b.shape === 'neurons') { e.fc = true; continue }
    if (e.from !== e.to && !e.flags.has('skip') && T.u - T.hu >= S.u + S.hu + 2) {
      const lo = Math.max(S.v - S.hv, T.v - T.hv) + 6, hi = Math.min(S.v + S.hv, T.v + T.hv) - 6
      const c = lo <= hi ? Math.min(hi, Math.max(lo, S.hv <= T.hv ? S.v : T.v)) : NaN
      direct.push({ e, S, T, ps: isNaN(c) ? S.v : c, pt: isNaN(c) ? T.v : c })
    } else rest.push(e)
  }
  const route = ({ e, S, T, ps, pt }: Plan) => {
    const s0 = S.u + S.hu, t0 = T.u - T.hu, mid = (s0 + t0) / 2
    const Z = (b: number): V[] => [[s0, ps], [b, ps], [b, pt], [t0, pt]]
    const cands: V[][] = Math.abs(ps - pt) < 0.5 ? [[[s0, pt], [t0, pt]]] : [Z(Math.max(mid, t0 - gapM / 2)), Z(Math.min(mid, s0 + gapM / 2))]
    // join: 'side' → down the source's line, then into the target's facing side
    if (e.flags.has('join') && Math.abs(ps - T.v) > T.hv) {
      const k = ps > T.v ? 1 : -1
      cands.unshift([[s0, ps], [T.u, ps], [T.u, T.v + k * T.hv]])
    }
    return cands.find(c => !hit(c, e.from, e.to))
  }
  // edges that can't go direct even from their ideal ports detour, and must not
  // push the arrowheads of the ones that can (keeps vertical arrows aligned)
  const live = direct.filter(p => route(p) || (rest.push(p.e), false))
  // spread arrowheads that land on the same side of a node
  const byT = new Map<string, Plan[]>()
  for (const p of live) { if (!byT.has(p.e.to)) byT.set(p.e.to, []); byT.get(p.e.to)!.push(p) }
  // The straight edge closest to the center is the anchor and never moves; the
  // others spread around it. If the node is too narrow for that, they enter
  // from the side instead (L shape), as papers draw ⊕ joins.
  const spread = (ps: Plan[], anchor: Plan | undefined, T: R) => {
    const pt = ps.map(p => p.pt), a = anchor ? ps.indexOf(anchor) : 0
    for (let i = a + 1; i < ps.length; i++) pt[i] = Math.max(pt[i], pt[i - 1] + 12)
    for (let i = a - 1; i >= 0; i--) pt[i] = Math.min(pt[i], pt[i + 1] - 12)
    const over = Math.max(0, pt[pt.length - 1] - (T.v + T.hv - 5)) - Math.max(0, T.v - T.hv + 5 - pt[0])
    return { pt: pt.map(x => x - over), moved: over !== 0 }
  }
  for (const all of byT.values()) {
    if (all.length < 2) continue
    const T = all[0].T
    all.sort((a, b) => a.pt - b.pt || a.S.v - b.S.v)
    const anchor = all.filter(p => Math.abs(p.ps - p.pt) < 0.5).sort((a, b) => Math.abs(a.pt - T.v) - Math.abs(b.pt - T.v))[0]
    let ps = all, r = spread(ps, anchor, T)
    if (anchor && r.moved) {
      ps = all.filter(p => {
        if (p === anchor || Math.abs(p.S.v - T.v) <= T.hv) return true
        const k = p.S.v > T.v ? 1 : -1, L: V[] = [[p.S.u + p.S.hu, p.S.v], [T.u, p.S.v], [T.u, T.v + k * T.hv]]
        if (hit(L, p.e.from, p.e.to)) return true
        p.alt = L
        return false
      })
      r = spread(ps, anchor, T)
    }
    ps.forEach((p, i) => { p.pt = r.pt[i] })
    for (const p of ps) if (Math.abs(p.pt - p.S.v) < p.S.hv - 4) p.ps = p.pt
  }
  const fin = (e: Edge, pts: V[], curve = 0) => {
    e.pts = pts.map(([u, v]) => toS(u, v))
    if (e.flags.has('curve') && pts.length === 4) e.curve = curve
  }
  for (const p of live) {
    const ok = p.alt ?? route(p)
    if (ok) fin(p.e, ok, 1)
    else rest.push(p.e)
  }
  // against the flow: straight, out of the side and up (L), or a Z, when the way is clear and
  // no forward edge links the same pair (that one would be drawn over); otherwise the U below
  const paired = (e: Edge) => d.edges.some(o => o !== e && ((o.from === e.from && o.to === e.to) || (o.from === e.to && o.to === e.from)))
  for (let i = rest.length - 1; i >= 0; i--) {
    const e = rest[i], S = rc.get(e.from)!, T = rc.get(e.to)!
    if (e.from === e.to || e.flags.has('skip') || T.u + T.hu > S.u - S.hu - 2 || paired(e)) continue
    const s0 = S.u - S.hu, t0 = T.u + T.hu, k = T.v > S.v ? 1 : -1, mid = (s0 + t0) / 2
    const lo = Math.max(S.v - S.hv, T.v - T.hv) + 6, hi = Math.min(S.v + S.hv, T.v + T.hv) - 6
    const cands: V[][] = []
    if (lo <= hi) { const c = Math.min(hi, Math.max(lo, S.hv <= T.hv ? S.v : T.v)); cands.push([[s0, c], [t0, c]]) }
    else cands.push([[S.u, S.v + k * S.hv], [S.u, T.v], [t0, T.v]], [[s0, S.v], [mid, S.v], [mid, T.v], [t0, T.v]])
    const ok = cands.find(c => !hit(c, e.from, e.to))
    if (ok) { fin(e, ok, 1); rest.splice(i, 1) }
  }
  for (const e of rest) {
    const S = rc.get(e.from)!, T = rc.get(e.to)!
    const side = /^(left|top|-)/.test(e.attrs.side ?? '') ? -1 : 1
    const lo = Math.min(S.v - S.hv, T.v - T.hv), hi = Math.max(S.v + S.hv, T.v + T.hv)
    if (e.from === e.to) {
      const v = S.v + side * (S.hv + 18)
      fin(e, [[S.u + S.hu * 0.4, S.v + side * S.hv], [S.u + S.hu * 0.4, v], [S.u - S.hu * 0.4, v], [S.u - S.hu * 0.4, S.v + side * S.hv]], 1.33)
    } else if (!e.flags.has('skip') && S.u - S.hu < T.u + T.hu && T.u - T.hu < S.u + S.hu) {
      // side by side: straight across
      const u = (Math.max(S.u - S.hu, T.u - T.hu) + Math.min(S.u + S.hu, T.u + T.hu)) / 2, k = T.v > S.v ? 1 : -1
      fin(e, [[u, S.v + k * S.hv], [u, T.v - k * T.hv]])
    } else if (T.u > S.u) {
      // forward but blocked (residual / skip): leave the out side, run beside the corridor, enter T's side
      const s0 = S.u + S.hu
      let g = Math.min(gapM / 2, (T.u - T.hu - s0) / 2)
      // entering a group from outside: branch just inside the group box (which sits GP before the first block)
      const a = d.nodes.get(e.from)!, b = d.nodes.get(e.to)!
      if (b.groups.some(x => !a.groups.includes(x))) {
        const first = Math.min(...[...rc.values()].filter(r => r.u - r.hu > s0 + 1 && r.u < T.u && r.v + r.hv > lo && r.v - r.hv < hi).map(r => r.u - r.hu))
        if (first - GP + 6 - s0 > 6) g = first - GP + 6 - s0
      }
      const v = channel(side, s0 + g, T.u + T.hu, lo, hi)
      fin(e, [[s0, S.v], [s0 + g, S.v], [s0 + g, v], [T.u, v], [T.u, T.v + side * T.hv]])
    } else {
      // backward: U around the side
      const v = channel(side, Math.min(S.u - S.hu, T.u - T.hu), Math.max(S.u + S.hu, T.u + T.hu), lo, hi)
      fin(e, [[S.u, S.v + side * S.hv], [S.u, v], [T.u, v], [T.u, T.v + side * T.hv]], 1.33)
    }
  }

  // --- groups: members + their internal edges, children before parents
  for (const g of [...d.groups].reverse()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const add = (x: number, y: number, p = GP) => { x0 = Math.min(x0, x - p); y0 = Math.min(y0, y - p); x1 = Math.max(x1, x + p); y1 = Math.max(y1, y + p) }
    const mem = new Set(nodes.filter(n => n.groups.includes(g.id)).map(n => n.id))
    for (const id of mem) { const n = d.nodes.get(id)!; add(n.x - n.w / 2, n.y - n.h / 2); add(n.x + n.w / 2, n.y + n.h / 2) }
    for (const e of d.edges) {
      if (mem.has(e.from) && mem.has(e.to)) for (const [x, y] of e.pts) add(x, y)
      // a residual entering from outside branches inside the box: keep its channel in, with a slim margin
      else if (mem.has(e.to) && e.pts.length === 5) for (const [x, y] of e.pts.slice(2)) add(x, y, 6)
    }
    for (const c of d.groups) if (c.parent === g.id && c.w) { add(c.x, c.y); add(c.x + c.w, c.y + c.h) }
    if (x0 === Infinity) continue
    const top = g.label ? 18 : 0
    Object.assign(g, { x: x0, y: y0 - top, w: x1 - x0, h: y1 - y0 + top })
  }

  // --- edge labels: beside the longest segment, outside of U turns. Greedy: the first spot
  // (that side, the other side, the other segments, then shifted along) that touches no
  // block, group title, edge or earlier label; else the first spot.
  // ponytail: labels placed earlier never move for later ones; reorder edges if a figure needs it
  const bs: Box[] = []
  for (const n of nodes) {
    bs.push([n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2 + (n.attrs.caption ? 20 : 0)])
    if (OUTSIDE.has(n.shape) && n.label) {
      const t = layoutLabel(n.label, labelSize(n, base), 500, n.attrs.fontFamily || family), y = n.y - n.h / 2 - 11 - +(n.attrs.ghost ?? n.attrs.heads ?? 0) * 5
      bs.push([n.x - t.w / 2, y - t.h / 2, n.x + t.w / 2, y + t.h / 2])
    }
  }
  for (const g of d.groups) if (g.w && g.label) {
    const t = layoutLabel(g.label, base - 2, 600, family)
    bs.push([g.x + 12, g.y + 13 - t.h / 2, g.x + 12 + t.w, g.y + 13 + t.h / 2])
  }
  const segs = d.edges.flatMap(e => e.pts.slice(1).map((b, i): [Edge, number, Box] => {
    const a = e.pts[i]
    return [e, i, [Math.min(a[0], b[0]) - 2, Math.min(a[1], b[1]) - 2, Math.max(a[0], b[0]) + 2, Math.max(a[1], b[1]) + 2]]
  }))
  for (const e of d.edges) {
    if (!e.label || e.pts.length < 2) continue
    const lb = layoutLabel(e.label, base - 1, REGULAR, family), f = e.pts[0], l = e.pts[e.pts.length - 1]
    const len = (i: number) => Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1])
    let bi = 0
    for (let i = 1; i + 1 < e.pts.length; i++) if (len(i) > len(bi)) bi = i
    if (e.flags.has('join') && e.pts.length === 3) bi = 1 // an L into a side: label where it arrives
    // beside segment i at fraction t; k = 1 keeps it outside of U turns, -1 the other side
    const at = (i: number, t: number, k: number): [number, number, number] => {
      const [a, b] = [e.pts[i], e.pts[i + 1]], mx = a[0] + (b[0] - a[0]) * t, my = a[1] + (b[1] - a[1]) * t
      if (Math.abs(a[1] - b[1]) < Math.abs(a[0] - b[0])) {
        const below = (my > Math.max(f[1], l[1]) + 1 ? 1 : -1) * k
        return [mx, my + below * (lb.h / 2 + 5), i]
      }
      const left = (mx < Math.min(f[0], l[0]) - 1 ? -1 : 1) * k
      return [mx + left * (lb.w / 2 + 7), my, i]
    }
    const order = [bi, ...e.pts.slice(1).map((_, i) => i).filter(i => i !== bi && len(i) > 1).sort((a, b) => len(b) - len(a))]
    const cands = [0.5, 0.25, 0.75].flatMap(t => order.flatMap(i => [at(i, t, 1), at(i, t, -1)]))
    const area = ([x, y]: number[]): Box => [x - lb.w / 2, y - lb.h / 2, x + lb.w / 2, y + lb.h / 2]
    const free = ([x, y, i]: number[]) => !bs.some(b => hits(area([x, y]), b)) && !segs.some(([o, j, b]) => !(o === e && j === i) && hits(area([x, y]), b))
    const [x, y] = cands.find(free) ?? cands[0]
    e.lx = x; e.ly = y
    bs.push(area([x, y]))
  }
  return d
}
