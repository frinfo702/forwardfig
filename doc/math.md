---
title: Math labels
group: Guide
order: 6
description: TeX in labels, typeset by MathJax when available, by a built-in engine otherwise, or by any engine you pass.
---

# Math labels

Any label, caption, edge label or axis name takes `$...$` TeX. A newline (`\n`) starts a new line.

## With MathJax

When the page has loaded MathJax 3, math is typeset by it automatically and embedded in the SVG as paths with real TeX metrics. Use `tex-svg-full.js`; the other builds load some extensions asynchronously.

```html
<script>window.MathJax = { startup: { typeset: false }, svg: { fontCache: 'local' } }</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg-full.js"></script>
<script type="module">await MathJax.startup.promise; /* draw figures */</script>
```

## Any other engine

In Node, or with another engine, pass a function that returns an `<svg viewBox>` with 1000 units per em:

```ts
configure({ tex: t => adaptor.outerHTML(html.convert(t, { display: false })) })  // mathjax-full
```

## The built-in engine

Without MathJax a small engine handles it — as on this site. It covers `^ _ \mathbf \mathrm \text \boldsymbol \mathcal \mathbb`, Greek letters, common symbols, `\hat \tilde \bar \vec`, and `\frac` (set as a/b), with TeX-like spacing. Force it with `configure({ tex: null })`.

```ts figure
import { Figure, block, text } from 'forwardfig'

const fig = new Figure({ flow: 'LR' })
const y = block('$\\mathrm{softmax}(QK^\\top/\\sqrt{d})V$')(fig.input('$\\mathbf{x}\\in\\mathbb{R}^{T\\times d}$'))
text('$p_\\theta(\\mathbf{y}|\\mathbf{x})$')(y)
```
