import { expect, test } from 'bun:test'
import { Figure, Module, Tensor, add, conv, ffn, figure, gaussian, image, mha, norm, op, space, sphere, text, thin, block, act, preset, configure, pointcloud, waveform, magnify, linear, matrix, voxels, vector, circle, type Layer } from '../src/index'
import { layout } from '../src/layout'
import { layoutLabel } from '../src/tex'

class EncoderLayer extends Module {
  attn = mha()
  n1 = norm()
  ff = ffn('🧊 FFN')
  n2 = norm()
  forward(x: Tensor) {
    const h = this.n1(add(x, this.attn(x)))
    return this.n2(add(h, this.ff(h)))
  }
}

test('Module: callable instance, group box, layers become nodes', () => {
  const fig = new Figure({ flow: 'BT' })
  const enc = new EncoderLayer({ label: 'Encoder', repeat: 'N×' })
  enc(fig.input('x'))
  const d = fig.diagram()
  expect(d.groups.map(g => g.label)).toEqual(['Encoder'])
  const labels = [...d.nodes.values()].map(n => n.label)
  expect(labels).toEqual(['x', 'Multi-Head Attention', '+', 'Add & Norm', 'FFN', '+', 'Add & Norm'])
  const ffnNode = [...d.nodes.values()].find(n => n.label === 'FFN')!
  expect(ffnNode.flags.has('frozen')).toBe(true)
  expect(ffnNode.groups).toEqual([d.groups[0].id])
})

test('Module.freeze() freezes everything inside unless a layer says otherwise', () => {
  class M extends Module {
    a = block('a')
    b = block('b').trainable()
    forward(x: Tensor) { return this.b(this.a(x)) }
  }
  const fig = new Figure()
  new M().freeze()(fig.input('x'))
  const [, a, b] = [...fig.diagram().nodes.values()]
  expect(a.flags.has('frozen')).toBe(true)
  expect(b.flags.has('train')).toBe(true)
})

test('layout: chain is straight, residual goes around', () => {
  const d = layout(figure({}, fig => {
    const x = fig.input('x')
    const a = mha()(x)
    norm()(a, x)
  }).diagram())
  const [xa, an, xn] = d.edges
  expect(xa.pts.length).toBe(2)
  expect(an.pts.length).toBe(2)
  expect(xn.pts.length).toBe(5)
})

test('layout: a detouring edge does not shift the straight arrow into the same node', () => {
  const d = layout(figure({}, fig => {
    const x = fig.input('x')
    const s = op('+')
    s(conv()(conv()(x)), x)
  }).diagram())
  const sum = [...d.nodes.values()].find(n => n.shape === 'op')!
  const straight = d.edges.find(e => e.to === sum.id && e.pts.length === 2)!
  expect(straight.pts[0][0]).toBe(sum.x)
})

test('layout: a side branch joins a small ⊕ from the side, the trunk stays straight', () => {
  const d = layout(figure({ flow: 'BT' }, fig => {
    const x = fig.input('x')
    add(block('W')(x), thin('B')(thin('A')(x)))
  }).diagram())
  const sum = [...d.nodes.values()].find(n => n.shape === 'op')!
  const [trunk, side] = d.edges.filter(e => e.to === sum.id)
  expect(trunk.pts.every(p => p[0] === sum.x)).toBe(true)
  expect(side.pts.length).toBe(3)
  expect(side.pts[2]).toEqual([sum.x + sum.w / 2, sum.y])
})

test('edge styles, placement refs, extra edges', () => {
  const fig = new Figure({ flow: 'LR' })
  const a = fig.input('a')
  const b = act()(a.edge({ label: 'go', dashed: true }))
  const side: Layer = text('note', { below: b })
  fig.input(side)
  fig.edge(b, act('back'), 'x')
  const d = fig.diagram()
  expect(d.edges[0]).toMatchObject({ op: '..>', label: 'go' })
  expect([...d.nodes.values()][2].attrs.below).toBe(b.node)
  expect(d.edges[1].to).toBe('n3')
})

test('errors are explicit', () => {
  expect(() => mha()()).toThrow('without inputs')
  const f1 = new Figure(), f2 = new Figure()
  expect(() => add(f1.input('a'), f2.input('b'))).toThrow('same figure')
  expect(() => new Figure().input(block('a', { id: 'k' })).graph.node(block('b', { id: 'k' }))).toThrow('duplicate id')
})

test('3D shapes and images render', () => {
  const svg = figure({ flow: 'LR' }, fig => {
    const x = fig.input(image('data:image/png;base64,AA==', 'img', { grid: 4, n: 3 }))
    const z = gaussian('$p(z)$', { peaks: [[-0.4, 0, 1], [0.5, 0.3, 0.6, 0.3]] })(x)
    const s = space('latent', { points: [[0, 0, 0, 1], [0.5, -0.5, 0.2, 2]] })(z)
    sphere('$\\mathbb{S}^2$', { points: [[1, 0, 0], [0, 0, 1, 3]] })(s)
  }).svg()
  expect(svg).toStartWith('<svg')
  expect(svg).toContain('<image href="data:image/png;base64,AA=="')
  expect(svg).toContain('radialGradient')
  expect(svg).not.toContain('NaN')
})

test('tex: scripts and fonts', () => {
  const runs = layoutLabel('$\\mathbf{x}_{t-1}^2$', 13).lines[0]
  expect(runs[0]).toMatchObject({ t: 'x', b: true, it: false })
  expect(runs.some(r => r.t === 't' && r.it && r.dy > 0)).toBe(true)
  expect(runs.some(r => r.t === '2' && r.dy < 0)).toBe(true)
})

test('textures and the neutral default color', () => {
  const svg = figure({}, fig => {
    const x = fig.input('x')
    block('q', { texture: 'quantized', color: 'blue' })(x)
    block('s', { texture: 'sparse' })(x)
    block('h', { texture: 'hatch' })(x)
    block('n', { texture: 'noise' })(x)
    block('g', { texture: 'glass', color: 'teal' })(x)
    block('m', { texture: 'metal' })(x)
    block('plain')(x)
  }).svg()
  for (const k of ['p-quantized-blue', 'p-sparse-none', 'p-hatch-none', 'p-grain-none', 'metal', 'c-none']) expect(svg).toContain(k)
  expect(svg).toContain('#e2e5e9')
  expect(svg).not.toContain('NaN')
})

test('crossed blocks and edges get a ✕', () => {
  const d = figure({}, fig => {
    const x = fig.input('x')
    block('gone', { crossed: true })(x.edge({ crossed: true }))
  }).diagram()
  expect([...d.nodes.values()][1].flags.has('crossed')).toBe(true)
  expect(d.edges[0].flags.has('crossed')).toBe(true)
  const svg = figure({}, fig => { block('gone', { crossed: true })(fig.input('x').edge({ crossed: true })) }).svg()
  expect(svg.match(/stroke="#dd6559"/g)?.length).toBe(2)
  expect(svg).toContain('opacity=".5"')
})

test('preset(): user-defined block types work like the built-ins', () => {
  const rmsnorm = preset('thin', 'RMSNorm', 'yellow')
  const moe = preset('block', 'MoE', { color: 'orange', ghost: 3, kind: 'moe' })
  const d = figure({}, fig => { moe()(rmsnorm()(fig.input('x'))) }).diagram()
  const [, r, m] = [...d.nodes.values()]
  expect(r).toMatchObject({ shape: 'thin', label: 'RMSNorm', color: 'yellow' })
  expect(m.attrs.ghost).toBe('3')
  expect(moe().kind).toBe('moe')
  expect(rmsnorm('Pre-Norm', { color: 'blue' }).options.color).toBe('blue')
})

test('style cascade: block > inner module > outer module > figure > configure > preset', () => {
  class Inner extends Module {
    a = block('a')
    b = block('b', { fontSize: 20 })
    forward(x: Tensor) { return this.b(this.a(x)) }
  }
  class Outer extends Module {
    inner = new Inner({ style: { fontSize: 11 } })
    c = mha()
    forward(x: Tensor) { return this.c(this.inner(x)) }
  }
  try {
    configure({ style: { fontSize: 15, color: 'gray' }, kinds: { mha: { color: 'purple' } } })
    const fig = new Figure({ style: { fontSize: 13 } })
    new Outer({ style: { fontSize: 12 } })(fig.input('x'))
    const [x, a, b, c] = [...fig.diagram().nodes.values()]
    expect(x.attrs.fontSize).toBe('13')             // figure beats configure
    expect(a.attrs.fontSize).toBe('11')             // inner module beats outer
    expect(b.attrs.fontSize).toBe('20')             // the block's own option beats everything
    expect(c.attrs.fontSize).toBe('12')             // outer module
    expect(a.color).toBe('gray')                    // configure style beats the preset default
    expect(c.color).toBe('purple')                  // kinds beat style at the same level
    configure({ kinds: { mha: { color: 'red' } } }) // configure merges
    expect([...fig.diagram().nodes.values()][3].color).toBe('red')
  } finally {
    configure(null)
  }
  expect(mha().defaults.color).toBe('orange')
})

test('a styled texture does not override freeze()', () => {
  const d = figure({ style: { texture: 'quantized' } }, fig => {
    const x = fig.input('x')
    block('f').freeze()(x)
    block('q')(x)
    block('own', { texture: 'glass' }).freeze()(x)
  }).diagram()
  const [, f, q, own] = [...d.nodes.values()]
  expect(f.attrs.texture).toBeUndefined()
  expect(f.flags.has('frozen')).toBe(true)
  expect(q.attrs.texture).toBe('quantized')
  expect(own.attrs.texture).toBe('glass')
})

test('fontSize changes block size and label size', () => {
  const small = layout(figure({}, fig => { block('Feed Forward')(fig.input('x')) }).diagram())
  const big = layout(figure({ style: { fontSize: 20 } }, fig => { block('Feed Forward')(fig.input('x')) }).diagram())
  const w = (d: typeof small) => [...d.nodes.values()][1].w
  expect(w(big)).toBeGreaterThan(w(small))
  expect(figure({ style: { fontSize: 18 } }, fig => { block('a')(fig.input('x').edge('lbl')) }).svg()).toContain('font-size="17"')
})

test('tex spacing: math minus, space around relations and binary ops, none in scripts', () => {
  const [run] = layoutLabel('$x_{t-1}$', 13).lines
  expect(run.some(r => r.t.includes('−'))).toBe(true)
  const w = (s: string) => layoutLabel(s, 13).w
  expect(w('$a=b$')).toBeGreaterThan(w('$ab$') + 13 * 1.1 * 0.5)   // = plus two thick spaces
  expect(w('$a+b$')).toBeGreaterThan(w('$a$') * 2)
  expect(w('$-a$')).toBeLessThan(w('$b-a$'))                     // unary minus gets no space
  const sub = layoutLabel('$x_{a=b}$', 13).w, flat = layoutLabel('$x_{ab}$', 13).w
  expect(sub - flat).toBeLessThan(13 * 0.7 * 1.1)                 // scripts stay tight
  expect(layoutLabel('$\\text{a-b}$', 13).lines[0].some(r => r.t.includes('-'))).toBe(true)
})

test('tex: a conditional bar gets thin spaces, |x| does not', () => {
  const w = (s: string) => layoutLabel(s, 13).w
  expect(w('$a|b$')).toBeGreaterThan(w('$ab$') + w('$|$') + 13 * 1.1 * 0.25)
  expect(w('$|x|$')).toBeLessThan(w('$x$') + 2 * w('$|$') + 13 * 1.1 * 0.1) // only the italic correction
})

test('a TeX engine replaces the built-in math layout', () => {
  // shape of MathJax's tex2svg output: viewBox in 1/1000 em, baseline at y = 0
  const fake = (tex: string) => `<svg width="2ex" viewBox="0 -750 2000 1000"><g data-tex="${tex}"/></svg>`
  try {
    configure({ tex: fake })
    const b = layoutLabel('a $\\theta$', 10)
    const m = b.lines[0].find(r => r.math)!.math!
    expect(m.w).toBeCloseTo(22)          // 2000/1000 em at 11px (math is 1.1× the label)
    expect(m.asc).toBeCloseTo(8.25)
    const svg = figure({}, fig => { fig.input('$\\theta$') }).svg()
    expect(svg).toContain('data-tex="\\theta"')
    expect(svg).toContain('viewBox="0 -750 2000 1000"')
  } finally {
    configure(null)
  }
  expect(layoutLabel('a $\\theta$', 10).lines[0].some(r => r.math)).toBe(false)
})

test('repeatSide: explicit sides, and auto avoids what is in the way', () => {
  class Body extends Module {
    a = block('a')
    forward(x: Tensor) { return this.a(x) }
  }
  const repeatXY = (svg: string) => {
    const m = /<text[^>]*font-size="15"[^>]*>(<tspan x="([\d.-]+)" y="([\d.-]+)")/.exec(svg)!
    return [+m[2], +m[3]]
  }
  const draw = (side?: 'top' | 'bottom' | 'left' | 'right' | 'auto') => {
    const fig = new Figure({ flow: 'LR' })
    // an input arrow runs into the group from the left, through the left-side spot
    new Body({ repeat: '×N', repeatSide: side })(fig.input('x'))
    const d = layout(fig.diagram())
    return { svg: fig.svg(), g: d.groups[0] }
  }
  const { svg: bottom, g } = draw('bottom')
  expect(repeatXY(bottom)[1]).toBeGreaterThan(g.y + g.h)
  const [, topY] = repeatXY(draw('top').svg)
  expect(topY).toBeLessThan(g.y)
  const [leftX] = repeatXY(draw('left').svg)
  expect(leftX).toBeLessThan(g.x)
  // auto: the arrow from x enters on the left at mid-height, so auto must not sit there
  const [ax, ay] = repeatXY(draw().svg)
  expect(ax < g.x && Math.abs(ay - (g.y + g.h / 2)) < 8).toBe(false)
})

test('pointcloud and waveform', () => {
  const audio = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 20) * (i % 4000) / 4000)
  const w = waveform('speech', { samples: audio })
  const cols = JSON.parse(JSON.stringify((w.options as { wave: number[][] }).wave))
  expect(cols.length).toBe(256)
  expect(cols.every(([lo, hi]: number[]) => lo <= hi && lo >= -1 && hi <= 1)).toBe(true)
  const svg = figure({ flow: 'LR' }, fig => {
    const x = fig.input(w)
    pointcloud('cloud', { shape: 'sphere', n: 50 })(x)
    pointcloud('labelled', { points: [[0, 0, 0, 1], [0.5, 0.5, 0.5, 2]] })(x)
    waveform()(x)
  }).svg()
  expect(svg.match(/<circle /g)!.length).toBeGreaterThanOrEqual(52)
  expect(svg).not.toContain('NaN')
  expect(svg.length).toBeLessThan(60000) // 16k samples don't leak into the SVG
})

test('tilted / rotated images: layout box grows to the transformed frame', () => {
  const box = (o: object) => {
    const d = layout(figure({}, fig => { fig.input(image('data:image/png;base64,AA==', { size: [60, 40], ...o })) }).diagram())
    return [...d.nodes.values()][0]
  }
  const flat = box({}), tilted = box({ tilt: 40 }), turned = box({ rotate: 90 })
  expect(flat).toMatchObject({ w: 60, h: 40 })
  expect(tilted.w).toBeCloseTo(60 * Math.cos(40 * Math.PI / 180), 1)
  expect(tilted.h).toBeGreaterThan(40)
  expect(turned.w).toBeCloseTo(40, 1)
  expect(turned.h).toBeCloseTo(60, 1)
  const svg = figure({}, fig => { fig.input(image('data:image/png;base64,AA==', { tilt: 30, n: 3 })) }).svg()
  expect(svg).toMatch(/transform="matrix\(0\.8660 -0\.1750 0\.0000 1\.0000 /)
})

test('export: svg blob anywhere; raster formats need a browser', async () => {
  const fig = figure({}, f => { block('a')(f.input('x')) })
  const blob = await fig.toBlob()
  expect(blob.type).toBe('image/svg+xml')
  expect(await blob.text()).toStartWith('<svg')
  await expect(fig.toBlob({ format: 'png' })).rejects.toThrow('needs a browser')
  await expect(fig.toBlob({ format: 'pdf' as never })).rejects.toThrow('unknown format')
})

test('frames of different images, first one in front', () => {
  const svg = figure({}, fig => { fig.input(image(['data:a', 'data:b', 'data:c'], { tilt: 30 })) }).svg()
  const order = [...svg.matchAll(/<image href="data:(\w)"/g)].map(m => m[1])
  expect(order).toEqual(['c', 'b', 'a']) // drawn back to front
})

test('magnify: lens crops the source region, zoom lines replace the arrow', () => {
  const fig = new Figure({ flow: 'LR' })
  const img = fig.input(image('data:x', { size: [80, 80], grid: 4 }))
  const patch = magnify({ patch: [1, 2] })(img)
  linear()(patch)
  const svg = fig.svg()
  expect(svg).toContain('viewBox="20 40 20 20"')      // column 1, row 2 of a 4×4 grid on 80px
  expect(svg).toContain('stroke-dasharray="3 3"')     // zoom lines
  const arrows = svg.match(/stroke-width="1.4" stroke-linecap="round"/g)!.length
  expect(arrows).toBe(1)                               // only magnify → linear is an arrow
})

test('magnify: a picture of your own in the lens', () => {
  const fig = new Figure({ flow: 'LR' })
  const img = fig.input(image('data:x', { grid: 4 }))
  magnify({ patch: [0, 0], src: 'data:hires' })(img)
  const svg = fig.svg()
  expect(svg).toContain('<image href="data:hires"')
  expect(svg).not.toContain('viewBox="0 0 16 16"') // no crop of the source
  expect(svg).toContain('stroke-dasharray="3 3"')  // zoom lines from the region stay
})

test('matrix and voxels: per-cell shade, color, texture, label, crossed', () => {
  const m = matrix('attn', { cells: (r, c) => (r === c ? { value: 1, label: '1' } : c > r ? { color: 'gray', crossed: true } : (r + c) / 8) })
  const v = voxels('feat', { rows: 3, cols: 4, depth: 2, cells: (r, c, d) => (d ? { texture: 'quantized' } : r / 2) })
  const fig = new Figure({ flow: 'LR' })
  v(m(fig.input('x')))
  const d = layout(fig.diagram())
  const [, mn, vn] = [...d.nodes.values()]
  expect([mn.w, mn.h]).toEqual([80, 80])
  expect([vn.w, vn.h]).toEqual([4 * 16 + 16, 3 * 16 + 16])
  const faces = JSON.parse(vn.attrs.faces)
  expect([faces.front.length, faces.top.length, faces.side[0].length]).toEqual([3, 2, 2])
  const svg = fig.svg()
  expect(svg.match(/stroke-width="1.5" stroke-linejoin="round"/g)!.length).toBe(25 + 12 + 8 + 6) // all cells drawn
  expect(svg).toContain('p-quantized-blue')
  expect(svg).not.toContain('NaN')
})

test('matrix / voxels axis names', () => {
  const svg = figure({}, fig => {
    fig.input(voxels({ axes: { rows: 'H', cols: 'W', depth: 'C' } }))
    fig.input(matrix({ rows: 2, cols: 3, axes: { cols: 'd' } }))
  }).svg()
  for (const a of ['H', 'W', 'C', 'd']) expect(svg).toContain(`>${a}</tspan>`)
})

test('a column that flows back up stays straight; side taps join as an L', () => {
  const fig = new Figure({ flow: 'TB' })
  const x = fig.input('x'), c = fig.input('c')
  const a = block('a'), b = block('b'), up1 = block('up1'), up2 = block('up2')
  const cond = block('mlp')(c)
  const y = b(a(x))
  const z = up2(up1(y), cond.edge({ join: 'side', label: 'g' }))
  fig.rank(a, up2); fig.rank(b, up1)
  const out = text('out')(z)
  fig.rank(out, x)
  const d = layout(fig.diagram())
  const node = (l: string) => [...d.nodes.values()].find(n => n.label === l)!
  expect(node('up1').x).toBe(node('up2').x)                    // one column
  const e = (f: string, t: string) => d.edges.find(e => e.from === node(f).id && e.to === node(t).id)!
  expect(e('up1', 'up2').pts.length).toBe(2)                    // straight up, no U detour
  const tap = e('mlp', 'up2')
  expect(tap.pts.length).toBe(3)                                // an L
  expect(tap.pts[2][1]).toBeCloseTo(node('up2').y)               // into the side
})

test('edge labels avoid blocks, other edges and each other', () => {
  for (const [flow, names] of [['TB', ['$\\alpha$ weight', '$\\beta$ weight', '$\\gamma$ weight']], ['LR', ['alpha', 'beta', 'gamma']]] as const) {
    const fig = new Figure({ flow })
    const x = fig.input('x')
    for (const l of names) block('Expert')(x.edge(l))
    const d = layout(fig.diagram())
    type B = [number, number, number, number]
    const hit = (a: B, b: B) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
    const labels = d.edges.map(e => { const t = layoutLabel(e.label!, 12); return [e.lx! - t.w / 2, e.ly! - t.h / 2, e.lx! + t.w / 2, e.ly! + t.h / 2] as B })
    const blocks = [...d.nodes.values()].map(n => [n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2] as B)
    labels.forEach((a, i) => {
      for (const b of blocks) expect(hit(a, b)).toBe(false)
      labels.forEach((b, j) => { if (i !== j) expect(hit(a, b)).toBe(false) })
      d.edges.forEach((e, j) => {
        if (i === j) return
        for (let k = 0; k + 1 < e.pts.length; k++) {
          const [p, q] = [e.pts[k], e.pts[k + 1]]
          expect(hit(a, [Math.min(p[0], q[0]) - 2, Math.min(p[1], q[1]) - 2, Math.max(p[0], q[0]) + 2, Math.max(p[1], q[1]) + 2])).toBe(false)
        }
      })
    })
  }
})

test('colors: CSS names pass through, out-of-range shades clamp, class numbers wrap', () => {
  const svg = figure(fig => {
    const x = fig.input('x')
    block('A', { color: 'crimson', texture: 'quantized' })(x)
    fig.input(voxels({ rows: 1, cols: 1, depth: 1, cells: () => 'rgb(1,2,3)' }))
    fig.input(matrix({ cells: [[2, -1]] }))
    fig.input(space({ points: [[0, 0, 0, -1], [0, 0, 0, 1.5]] }))
    block('B')(x.edge({ color: 'crimson' }))
  }).svg()
  expect(svg).not.toContain('NaN')
  expect(svg).not.toMatch(/#-|#[\da-f]{7}/)
  expect(svg).toContain('stroke="crimson"')
})

test('quotes in URLs and colors cannot break out of attributes', () => {
  const svg = figure(fig => {
    image('a.png" onload="alert(1)')(fig.input('x'))
    fig.input(block('A', { color: 'x" onclick="y' }))
  }).svg()
  expect(svg).not.toContain('onload="')
  expect(svg).not.toContain('onclick="')
})

test('ids: auto ids skip user ids; nodes and groups share one namespace', () => {
  class G extends Module { forward(x: Tensor) { return block('B')(x) } }
  const d = figure(fig => { new G({ label: 'G' })(block('A')(fig.input('x', { id: 'n1' }))) }).diagram()
  expect(new Set([...d.nodes.keys(), ...d.groups.map(g => g.id)]).size).toBe(d.nodes.size + d.groups.length)
  expect(() => figure(fig => { new G({ label: 'G', id: 'n0' })(fig.input('x')) })).toThrow('duplicate id "n0"')
})

test('API: fig.edge keeps tensor style, input() adds options, grids infer size, configure() returns a copy', () => {
  const fig = new Figure()
  const x = fig.input('x'), B = block('B')
  B(x)
  fig.edge(x.edge({ dashed: true }), B)
  expect(fig.diagram().edges[1].flags.has('dashed')).toBe(true)
  const L = block('L')
  fig.input(L, { below: B })
  expect(L.options.below).toBe(B)
  const v = voxels({ cells: [[[0.1, 0.2]], [[0.3]]] })
  expect([v.options.rows, v.options.cols, v.options.depth]).toEqual([2, 1, 2])
  expect(matrix({ cells: [] }).options.cols).toBe(0)
  configure({ style: { color: 'red' } }).flow = 'LR'
  expect(new Figure().diagram().dir).toBe('TB')
  configure(null)
})

test('API: figure(fn), vector label, circle shape, cellSize, space axes, trainable()', () => {
  const fig = figure(fig => {
    vector(['a', 'b'], 'tokens', { color: 'blue' })(fig.input('x'))
    fig.input(space({ axes: { z: 'depth' } }))
    fig.input(matrix({ rows: 2, cols: 2, cellSize: 10 }))
  })
  const d = layout(fig.diagram())
  const node = (s: string) => [...d.nodes.values()].find(n => n.shape === s)!
  expect(node('vector').label).toBe('tokens')
  expect([node('matrix').w, node('matrix').h]).toEqual([20, 20])
  const svg = fig.svg()
  for (const a of ['x', 'y', 'depth']) expect(svg).toContain(`>${a}</tspan>`)
  expect(circle('z').shape).toBe('circle')
  class M extends Module { b = block('b'); forward(x: Tensor) { return this.b(x) } }
  const t = new Figure()
  new M({ trainable: true })(t.input('x'))
  expect([...t.diagram().nodes.values()][1].flags.has('train')).toBe(true)
})
