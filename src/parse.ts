export type Dir = 'TB' | 'BT' | 'LR' | 'RL'

export interface Node {
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
  nodes: Map<string, Node>; edges: Edge[]; groups: Group[]; ranks: string[][]
}

// preset → [shape, color, default label]
export const PRESETS: Record<string, [string, string?, string?]> = {
  block: ['block'], box: ['block'], thin: ['thin'], op: ['op'], var: ['var'], circle: ['var'],
  tensor: ['tensor', 'blue'], cube: ['tensor', 'blue'], stack: ['stack', 'blue'], fmap: ['stack', 'blue'],
  enc: ['enc', 'blue', 'Encoder'], dec: ['dec', 'green', 'Decoder'],
  neurons: ['neurons'], vector: ['vector'], image: ['image'], text: ['text'],
  attn: ['block', 'orange', 'Attention'], mha: ['block', 'orange', 'Multi-Head Attention'],
  ffn: ['block', 'blue', 'Feed Forward'], mlp: ['block', 'blue', 'MLP'],
  norm: ['thin', 'yellow', 'Add & Norm'], embed: ['block', 'pink', 'Embedding'],
  linear: ['thin', 'purple', 'Linear'], softmax: ['thin', 'green', 'Softmax'], matmul: ['thin', 'purple', 'MatMul'],
  concat: ['thin', 'yellow', 'Concat'], conv: ['block', 'teal', 'Conv'], pool: ['thin', 'gray', 'Pool'],
  act: ['thin', 'green', 'ReLU'], dropout: ['thin', 'gray', 'Dropout'], loss: ['block', 'red', 'Loss'],
}
export const COLORS = new Set('pink orange blue yellow green purple gray red teal white'.split(' '))
const EMOJI: Record<string, string> = { '🧊': 'frozen', '❄️': 'frozen', '🔥': 'train' }
const DIRS = new Set(['TB', 'BT', 'LR', 'RL', 'TD'])

type Tok = { k: 'str' | 'kv' | 'op' | 'p' | 'w'; v: string; v2?: string }
const TOK = /\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z][\w-]*)=("(?:[^"\\]|\\.)*"|[^\s"]*)|(<->|-->|->|\.\.>|\.\.|--|=>)|([{},])|([\w\u0080-￿]+))/y
const unq = (s: string) => s.replace(/\\"/g, '"')

function tokenize(line: string, ln: number): Tok[] {
  const out: Tok[] = []
  TOK.lastIndex = 0
  while (TOK.lastIndex < line.length) {
    const at = TOK.lastIndex
    const m = TOK.exec(line)
    if (!m) {
      if (!line.slice(at).trim()) break
      throw new Error(`line ${ln}: unexpected "${line.slice(at).trim()}"`)
    }
    if (m[1] !== undefined) out.push({ k: 'str', v: unq(m[1]) })
    else if (m[2]) out.push({ k: 'kv', v: m[2], v2: unq(m[3].replace(/^"|"$/g, '')) })
    else if (m[4]) out.push({ k: 'op', v: m[4] })
    else if (m[5]) out.push({ k: 'p', v: m[5] })
    else if (m[6]) out.push({ k: 'w', v: m[6] })
  }
  return out
}

export function parse(src: string): Diagram {
  const d: Diagram = { dir: 'TB', theme: 'light', nodes: new Map(), edges: [], groups: [], ranks: [] }
  const stack: Group[] = []
  const memberOf = () => stack.map(g => g.id)

  const node = (id: string): Node => {
    let n = d.nodes.get(id)
    if (!n) {
      n = { id, shape: 'block', label: id, flags: new Set(), attrs: {}, groups: memberOf(), order: d.nodes.size, x: 0, y: 0, w: 0, h: 0 }
      d.nodes.set(id, n)
    }
    return n
  }
  const apply = (n: Node, toks: Tok[], defining: boolean) => {
    let shaped = !defining
    for (const t of toks) {
      if (t.k === 'str') n.label = t.v
      else if (t.k === 'kv') {
        if (t.v === 'color') n.color = t.v2
        else n.attrs[t.v] = t.v2!
      } else if (t.k === 'w') {
        const p = PRESETS[t.v]
        if (p && !shaped) {
          shaped = true
          n.shape = p[0]
          if (p[1] && !n.color) n.color = p[1]
          if (p[2] && n.label === n.id) n.label = p[2]
        } else if (COLORS.has(t.v)) n.color = t.v
        else n.flags.add(t.v)
      }
    }
    for (const e in EMOJI) if (n.label.includes(e)) { n.flags.add(EMOJI[e]); n.label = n.label.replace(e, '').trim() }
    if (n.flags.has('trainable')) n.flags.add('train')
  }

  src.split('\n').forEach((raw, idx) => {
    const ln = idx + 1
    const line = raw.replace(/%%.*$/, '')
    if (/^\s*#/.test(line)) return
    const toks = tokenize(line, ln)
    if (!toks.length) return
    const [h] = toks
    const word = h.k === 'w' ? h.v : ''
    if (['flow', 'direction', 'graph', 'arch'].includes(word)) {
      const v = toks[1]?.v.toUpperCase()
      if (!v || !DIRS.has(v)) throw new Error(`line ${ln}: direction must be TB, BT, LR or RL`)
      d.dir = (v === 'TD' ? 'TB' : v) as Dir
    } else if (word === 'theme') d.theme = toks[1]?.v || 'light'
    else if (word === 'gap') d.gap = [+toks[1]?.v || 36, +(toks[2]?.v ?? toks[1]?.v) || 40]
    else if (word === 'rank' || word === 'same') {
      const ids = toks.slice(1).filter(t => t.k === 'w').map(t => (node(t.v), t.v))
      d.ranks.push(ids)
    } else if (word === 'group') {
      if (toks[toks.length - 1].v !== '{') throw new Error(`line ${ln}: group needs "{" at the end`)
      const id = toks[1]?.k === 'w' ? toks[1].v : `g${d.groups.length}`
      const g: Group = { id, label: '', parent: stack[stack.length - 1]?.id, flags: new Set(), attrs: {}, x: 0, y: 0, w: 0, h: 0 }
      for (const t of toks.slice(1, -1)) {
        if (t.k === 'str') g.label = t.v
        else if (t.k === 'kv') g.attrs[t.v] = t.v2!
        else if (t.k === 'w' && t !== toks[1]) g.flags.add(t.v)
      }
      d.groups.push(g)
      stack.push(g)
    } else if (h.k === 'p' && h.v === '}') {
      if (!stack.pop()) throw new Error(`line ${ln}: unmatched "}"`)
    } else if (word === 'style') {
      const ids: string[] = []
      let i = 1
      for (; i < toks.length; i++) {
        const t = toks[i]
        if (t.k === 'w' && (ids.length === 0 || toks[i - 1].v === ',')) ids.push(t.v)
        else if (t.k !== 'p') break
      }
      for (const id of ids) apply(node(id), toks.slice(i), false)
    } else if (toks.some(t => t.k === 'op')) edgeLine(toks, ln)
    else if (h.k === 'w') {
      if (stack.length && toks.every(t => t.k === 'w' && d.nodes.has(t.v))) {
        for (const t of toks) for (const g of memberOf()) d.nodes.get(t.v)!.groups.includes(g) || d.nodes.get(t.v)!.groups.push(g)
      } else apply(node(h.v), toks.slice(1), true)
    } else throw new Error(`line ${ln}: expected a node id`)
  })
  if (stack.length) throw new Error(`group "${stack[stack.length - 1].id}" is missing "}"`)
  return d

  function edgeLine(toks: Tok[], ln: number) {
    const lists: string[][] = [[]]
    const ops: { op: string; label?: string }[] = []
    const flags = new Set<string>(), attrs: Record<string, string> = {}
    let trailing: string | undefined
    let want = true // expecting an id
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      const cur = lists[lists.length - 1]
      if (t.k === 'op') { ops.push({ op: t.v }); lists.push([]); want = true }
      else if (t.k === 'str' && toks[i - 1]?.k === 'op') ops[ops.length - 1].label = t.v
      else if (t.k === 'p' && t.v === ',') want = true
      else if (t.k === 'w' && want) { cur.push(t.v); want = false }
      else if (!ops.length) throw new Error(`line ${ln}: unexpected "${t.v}" before arrow`)
      else if (t.k === 'w') flags.add(t.v)
      else if (t.k === 'kv') attrs[t.v] = t.v2!
      else if (t.k === 'str') trailing = t.v
    }
    if (lists.some(l => !l.length)) throw new Error(`line ${ln}: arrow is missing an endpoint`)
    if (trailing !== undefined) ops[ops.length - 1].label ??= trailing
    ops.forEach((o, k) => {
      for (const a of lists[k]) for (const b of lists[k + 1]) {
        node(a); node(b)
        d.edges.push({ from: a, to: b, op: o.op, label: o.label, flags, attrs, pts: [] })
      }
    })
  }
}
