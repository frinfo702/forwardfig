import { expect, test } from 'bun:test'
import { Figure, Module, Tensor, add, conv, ffn, figure, gaussian, image, mha, norm, op, space, sphere, text, thin, block, act, preset, configure, type Layer } from '../src/index'
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
    b = block('b').train()
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
