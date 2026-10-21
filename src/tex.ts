// Labels → positioned text runs. Math ($...$) goes to a real TeX engine when one is
// available (MathJax's SVG output: true TeX metrics and glyphs, embedded as paths);
// otherwise a tiny built-in fallback covers the subset ML figures use.

export const SANS = 'Inter,"Helvetica Neue",Helvetica,Arial,sans-serif'
export const SERIF = '"Latin Modern Math","STIX Two Math","Cambria Math","Times New Roman",serif'

export interface Run {
  t: string; x: number; dy: number; size: number; it: boolean; b: boolean; serif: boolean
  /** typeset math from the TeX engine: inner SVG markup, its viewBox, and its box around the baseline */
  math?: { inner: string; viewBox: string; w: number; asc: number; desc: number }
}

/** tex source → an <svg viewBox="..."> string, as MathJax's tex2svg produces (1000 viewBox units per em). */
export type TexEngine = (tex: string) => string
let engine: TexEngine | null | undefined
/** Use a TeX engine (null = always the built-in fallback, undefined = auto-detect MathJax). */
export function setTex(e: TexEngine | null | undefined) { engine = e; boxes.clear() }
const mathjax = (): TexEngine | null => {
  const mj = (globalThis as { MathJax?: { tex2svg?: (t: string, o: object) => Element } }).MathJax
  return mj?.tex2svg ? t => mj.tex2svg!(t, { display: false }).querySelector('svg')?.outerHTML ?? '' : null
}
const typeset = (tex: string, size: number): Run['math'] | null => {
  const e = engine === undefined ? mathjax() : engine
  if (!e) return null
  let svg: string
  try { svg = e(tex) } catch { return null } // e.g. MathJax wanting to load an extension asynchronously
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]
  if (!vb) return null
  const [, y0, vw, vh] = vb.trim().split(/[\s,]+/).map(Number), k = size / 1000
  return { inner: svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''), viewBox: vb, w: vw * k, asc: -y0 * k, desc: (vh + y0) * k }
}
export interface TextBox { lines: Run[][]; widths: number[]; w: number; h: number; lh: number; size: number }

type Style = { it?: boolean; b?: boolean; up?: boolean; text?: boolean; sans?: boolean; map?: (c: string) => string }
// TeX atom classes, for the spacing between neighbours
type Cls = 'ord' | 'bin' | 'rel' | 'punct' | 'open' | 'close' | 'mid'
type Glyph = { t: string; it: boolean; b: boolean; serif: boolean; cls?: Cls }
type Script = { sub?: Item[]; sup?: Item[] }
type Item = Glyph | Script

const table = (s: string) => {
  const m: Record<string, string> = {}
  const p = s.split(' ')
  for (let i = 0; i < p.length; i += 2) m[p[i]] = p[i + 1]
  return m
}
const GREEK = table('alpha α beta β gamma γ delta δ epsilon ϵ varepsilon ε zeta ζ eta η theta θ vartheta ϑ iota ι kappa κ lambda λ mu μ nu ν xi ξ pi π rho ρ sigma σ tau τ upsilon υ phi ϕ varphi φ chi χ psi ψ omega ω Gamma Γ Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Phi Φ Psi Ψ Omega Ω')
const SYM = table('cdot · times × oplus ⊕ otimes ⊗ odot ⊙ to → rightarrow → leftarrow ← gets ← Rightarrow ⇒ leftrightarrow ↔ mapsto ↦ sum ∑ prod ∏ int ∫ infty ∞ partial ∂ nabla ∇ in ∈ notin ∉ sim ∼ approx ≈ propto ∝ leq ≤ le ≤ geq ≥ ge ≥ neq ≠ ne ≠ pm ± mp ∓ ldots … dots … cdots ⋯ vdots ⋮ mid ∣ | ‖ ast ∗ star ⋆ circ ∘ bullet • forall ∀ exists ∃ emptyset ∅ cup ∪ cap ∩ subset ⊂ subseteq ⊆ top ⊤ perp ⊥ langle ⟨ rangle ⟩ ell ℓ hbar ℏ dagger † prime ′ { { } } % % _ _ # # & & $ $')
const CLS: Record<string, Cls> = {}
for (const c of '+−×·±∓⊕⊗⊙∘∗⋆∪∩') CLS[c] = 'bin'
for (const c of '=<>≤≥≠≈∼∝∈∉⊂⊆→←⇒↔↦∣') CLS[c] = 'rel'
for (const c of ',;') CLS[c] = 'punct'
// a bar between terms is almost always a conditional, p(x|y): give it \mid's thin spaces
CLS['|'] = 'mid'
for (const c of '([⟨') CLS[c] = 'open'
for (const c of ')]⟩') CLS[c] = 'close'
const OPS = new Set('log exp ln sin cos tanh max min arg argmax argmin softmax lim det tr sup inf Pr KL diag sign'.split(' '))
const ACCENT = table('hat ̂ widehat ̂ tilde ̃ widetilde ̃ bar ̄ overline ̅ dot ̇ ddot ̈ vec ⃗')
const SPACE = table(',   :   ;   quad   qquad    ! ​')
const CAL_EX = table('B ℬ E ℰ F ℱ H ℋ I ℐ L ℒ M ℳ R ℛ')
const BB_EX = table('C ℂ H ℍ N ℕ P ℙ Q ℚ R ℝ Z ℤ')
const cal = (c: string) => CAL_EX[c] || (/[A-Z]/.test(c) ? String.fromCodePoint(0x1d49c + c.charCodeAt(0) - 65) : c)
const bb = (c: string) => BB_EX[c] || (/[A-Z]/.test(c) ? String.fromCodePoint(0x1d538 + c.charCodeAt(0) - 65) : /\d/.test(c) ? String.fromCodePoint(0x1d7d8 + +c) : c)

const FONTS: Record<string, Style> = {
  mathbf: { up: true, b: true }, bf: { up: true, b: true }, boldsymbol: { b: true }, bm: { b: true },
  mathrm: { up: true }, rm: { up: true }, operatorname: { up: true }, mathit: {},
  text: { up: true, text: true }, textrm: { up: true, text: true }, mathsf: { up: true, sans: true }, textbf: { up: true, b: true, text: true },
  mathcal: { up: true, map: cal }, mathscr: { up: true, map: cal }, mathbb: { up: true, map: bb },
}
const IGNORE = new Set('left right big Big bigl bigr Bigl Bigr displaystyle'.split(' '))

function parseMath(s: string): Item[] {
  let i = 0
  const glyph = (t: string, st: Style, letter = false): Glyph => {
    if (st.text) return { t, it: false, b: !!st.b, serif: !st.sans }
    if (t === '-') t = '−' // a math minus, not a hyphen
    return { t, it: letter && !st.up, b: !!st.b, serif: !st.sans, cls: CLS[t] }
  }
  function seq(st: Style, stop?: string): Item[] {
    const out: Item[] = []
    while (i < s.length) {
      const c = s[i]
      if (c === stop) { i++; break }
      if (c === '^' || c === '_') {
        i++
        const k = c === '^' ? 'sup' : 'sub'
        let last = out[out.length - 1] as Script | undefined
        if (!last || 't' in last || last[k]) out.push(last = {})
        last[k] = atom(st)
        continue
      }
      if (c === ' ' && !st.text) { i++; continue }
      out.push(...atom(st))
    }
    return out
  }
  function atom(st: Style): Item[] {
    while (s[i] === ' ' && !st.text) i++
    const c = s[i++]
    if (c === undefined) return []
    if (c === '{') return seq(st, '}')
    if (c !== '\\') return [glyph(st.map ? st.map(c) : c, st, /[A-Za-z]/.test(c) && !st.map)]
    const name = /^[A-Za-z]+/.exec(s.slice(i))?.[0] || s[i] || ''
    i += name.length
    if (GREEK[name]) return [glyph(GREEK[name], st, /^[a-z]/.test(name))]
    if (SYM[name]) return [glyph(SYM[name], st)]
    if (SPACE[name]) return [glyph(SPACE[name], st)]
    if (OPS.has(name)) return [glyph(name, { ...st, up: true })]
    if (FONTS[name]) return atom({ ...st, ...FONTS[name] })
    if (ACCENT[name]) {
      const arg = atom(st)
      const g = arg.find(a => 't' in a) as Glyph | undefined
      if (g) g.t += ACCENT[name]
      return arg
    }
    if (name === 'frac') { const a = atom(st), b = atom(st); return [...a, glyph('/', st), ...b] }
    if (name === 'sqrt') return [glyph('√', st), ...atom(st)]
    if (IGNORE.has(name)) return []
    return [glyph(name, { ...st, up: true })]
  }
  return seq({})
}

const boxes = new Map<string, TextBox>()

// --- measurement --------------------------------------------------------------

let ctx: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

export function font(size: number, it: boolean, b: boolean | number, serif: boolean, family = SANS) {
  return `${it ? 'italic ' : ''}${b === true ? 700 : b || 400} ${size}px ${serif ? SERIF : family}`
}

function charW(c: string) {
  if (/[iljI.,:;'|! ]/.test(c)) return 0.28
  if (/[mwMW]/.test(c)) return 0.86
  if (/[A-Z]/.test(c)) return 0.68
  if (/[̀-ͯ⃗​]/.test(c)) return 0
  if (/[　-鿿＀-￯]/.test(c)) return 1
  if (c === ' ') return 0.28
  return 0.56
}

export function measure(t: string, f: string, size: number): number {
  const k = f + '\0' + t
  let w = cache.get(k)
  if (w !== undefined) return w
  if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  if (ctx) { ctx.font = f; w = ctx.measureText(t).width }
  else { w = 0; for (const c of t) w += charW(c) * size }
  cache.set(k, w)
  return w
}

// --- label layout ------------------------------------------------------------

/** Lay out a label: newline, `\\` or `<br>` break lines, `$...$` switches to math. */
export function layoutLabel(label: string, size: number, weight = 400, family = SANS): TextBox {
  const key = label + '\0' + size + '\0' + weight + '\0' + family + '\0' + (engine === undefined ? !!mathjax() : !!engine)
  const hit = boxes.get(key)
  if (hit) return hit
  const lines: Run[][] = [], widths: number[] = []
  for (const line of label.split(/\n|\\\\|<br\s*\/?>/)) {
    const runs: Run[] = []
    let x = 0
    // top: the main math line, where TeX puts space around binary operators and
    // relations (it doesn't inside scripts)
    const place = (items: Item[], dy: number, sz: number, top = false) => {
      let prev: Cls | '' = '', italic = false, lastChar = '', abs = false
      for (const it of items) {
        if ('t' in it) {
          let cls = it.cls ?? 'ord'
          const leading = !prev || prev === 'bin' || prev === 'rel' || prev === 'open' || prev === 'punct'
          if (cls === 'bin' && leading) cls = 'ord' // unary minus
          // |x|: a leading bar opens, the next one closes; any other bar is a conditional
          else if (cls === 'mid' && (leading || abs)) { cls = abs ? 'close' : 'open'; abs = !abs }
          let gap = 0
          if (top && prev && cls !== 'punct' && cls !== 'close' && prev !== 'open') {
            if ((cls === 'rel') !== (prev === 'rel')) gap = 5 / 18
            else if (cls === 'bin' || prev === 'bin') gap = 4 / 18
            else if (prev === 'punct' || cls === 'mid' || prev === 'mid') gap = 3 / 18
          }
          // italic correction: an italic glyph's top leans into an upright neighbour
          if (italic && !it.it && cls !== 'punct') gap += 0.08
          x += gap * sz
          const w = measure(it.t, font(sz, it.it, it.b || (it.serif ? false : weight), it.serif, family), sz)
          const last = runs[runs.length - 1]
          if (!gap && last && last.dy === dy && last.size === sz && last.it === it.it && last.b === it.b && last.serif === it.serif) last.t += it.t
          else runs.push({ t: it.t, x, dy, size: sz, it: it.it, b: it.b, serif: it.serif })
          x += w
          prev = cls
          italic = it.it
          lastChar = it.t.slice(-1)
        } else {
          // scripts at 0.72×, but never below 8.5px: small labels otherwise turn θ into a smudge
          const x0 = x, ss = Math.max(sz * 0.72, Math.min(sz, 8.5))
          let x1 = x0, x2 = x0
          // superscripts sit past the base's italic overhang; subscripts tuck under it
          if (it.sup) { x = x0 + (italic ? (lastChar === 'f' ? 0.2 : 0.08) * sz : 0); place(it.sup, dy - sz * 0.38, ss); x1 = x; x = x0 }
          if (it.sub) { place(it.sub, dy + sz * 0.24, ss); x2 = x }
          x = Math.max(x1, x2) + 0.06 * sz // TeX's \scriptspace
          italic = false
        }
      }
    }
    line.split('$').forEach((part, k) => {
      const m = k % 2 ? typeset(part, size * 1.1) : null
      if (m) { runs.push({ t: '', x, dy: 0, size, it: false, b: false, serif: true, math: m }); x += m.w }
      else if (k % 2) place(parseMath(part), 0, size * 1.1, true)
      else if (part) place([{ t: part, it: false, b: false, serif: false }], 0, size)
    })
    lines.push(runs)
    widths.push(x)
  }
  const lh = size * 1.3
  const box = { lines, widths, w: Math.max(0, ...widths), h: lines.length * lh, lh, size }
  boxes.set(key, box)
  return box
}
