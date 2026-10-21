import { expect, test } from 'bun:test'
import { layout, parse, render } from '../src/index'
import { layoutLabel } from '../src/tex'

const src = `flow TB
x text "$\\mathbf{x}$"
a mha
n norm
f ffn "🧊 FFN"
x -> a -> n -> f
x -> n`

test('parse: presets, emoji flags, edges', () => {
  const d = parse(src)
  expect(d.nodes.get('a')!.label).toBe('Multi-Head Attention')
  expect(d.nodes.get('f')!.flags.has('frozen')).toBe(true)
  expect(d.nodes.get('f')!.label).toBe('FFN')
  expect(d.edges.length).toBe(4)
})

test('layout: chain is straight, blocked skip goes around', () => {
  const d = layout(parse(src))
  const [xa, an, nf, skip] = d.edges
  for (const e of [xa, an, nf]) expect(e.pts.length).toBe(2)
  expect(new Set([xa, an, nf].flatMap(e => e.pts.map(p => p[0]))).size).toBe(1)
  expect(skip.pts.length).toBe(5)
  const a = d.nodes.get('a')!
  expect(Math.max(...skip.pts.map(p => p[0]))).toBeGreaterThan(a.x + a.w / 2)
})

test('tex: scripts and fonts', () => {
  const b = layoutLabel('$\\mathbf{x}_{t-1}^2$', 13)
  const runs = b.lines[0]
  expect(runs[0]).toMatchObject({ t: 'x', b: true, it: false })
  expect(runs.some(r => r.t === 't' && r.it && r.dy > 0)).toBe(true)
  expect(runs.some(r => r.t === '2' && r.dy < 0)).toBe(true)
})

test('render: svg out, errors carry line numbers', () => {
  expect(render(src)).toStartWith('<svg')
  expect(() => render('flow XY')).toThrow('line 1')
  expect(() => render('a -> ')).toThrow('line 1')
})
