# forwardfig

Draw ML architecture figures in TypeScript, written the way you write the model. Zero dependencies, about 19 KB gzipped, SVG out, in the browser or in Node.

- Docs: https://frinfo702.github.io/forwardfig/docs/
- Demo (paper figure gallery and playground): https://frinfo702.github.io/forwardfig/demo/

## Install

```sh
npm install forwardfig   # or: pnpm add / yarn add / bun add forwardfig, deno add npm:forwardfig
```

### Agent skill

To have a coding agent (Claude Code, Codex, Cursor, …) draw figures with forwardfig, install the skill in [`skills/forwardfig-diagrams`](skills/forwardfig-diagrams/SKILL.md):

```sh
npx skills add frinfo702/forwardfig
```

It gives the agent the API, layout tips and worked paper figures, and has it render to PNG and check the result.

## Example

```ts
import { Figure, Module, Tensor, mha, norm, ffn, text } from 'forwardfig'

class EncoderLayer extends Module {        // like nn.Module
  attn = mha()
  n1 = norm()
  ff = ffn()
  n2 = norm()
  forward(x: Tensor) {
    const h = this.n1(this.attn(x), x)     // Add & Norm with a residual
    return this.n2(this.ff(h), h)
  }
}

const fig = new Figure({ flow: 'BT' })      // drawing side, like matplotlib
const y = new EncoderLayer({ repeat: 'N×' }).freeze()(fig.input('$\\mathbf{x}$'))
text('$\\mathbf{h}$')(y)
fig.mount('#figure')                        // or fig.svg() for a string
```

Layers are callables, modules have a `forward`, and a `Figure` draws whatever they produce. Calling the same layer twice reuses its node, so shared weights stay one block.

## What it draws

- **Blocks**: `block`, `thin`, `op('+')`, `enc` / `dec`, tensors, stacks, neurons, and ML presets (`mha`, `ffn`, `norm`, `conv`, `loss`, ...). Define your own with `preset()`.
- **Data**: images (patch grids, batches, tilted frames), `matrix` / `voxels` grids, `magnify` lenses, waveforms, function plots with scatter points, Gaussians, 3D scatters and point clouds.
- **Looks**: `freeze()` renders ice, `trainable()` renders magma, plus glass, metal, noise, quantized, sparse and hatch textures. `crossed` marks removed parts, and `legend: true` adds a key.
- **Labels**: `$...$` is TeX, typeset by MathJax when the page loads it, otherwise by a built-in subset.
- **Layout**: automatic and straight-edged, with overrides (`lane`, `align`, `leftOf`, `at`, ...) when you need them.
- **Styling**: matplotlib-like defaults by scope, from `configure()` down to a single block.

## Export

```ts
fig.svg()                                // string, works in Node
await fig.download('figure.png')         // .svg .png .jpg .webp (raster needs a browser)
```

From the command line, `npx forwardfig model.ts -o fig.svg` writes the module's default export. PNG / JPEG / WebP need the optional peer dependency `sharp`.

## Docs

[Getting started](https://frinfo702.github.io/forwardfig/docs/getting-started/) ·
[Concepts](https://frinfo702.github.io/forwardfig/docs/concepts/) ·
[Blocks](https://frinfo702.github.io/forwardfig/docs/blocks/) ·
[Images and data](https://frinfo702.github.io/forwardfig/docs/images-and-data/) ·
[Styling](https://frinfo702.github.io/forwardfig/docs/styling/) ·
[Layout and edges](https://frinfo702.github.io/forwardfig/docs/layout/) ·
[Math labels](https://frinfo702.github.io/forwardfig/docs/math/) ·
[Export](https://frinfo702.github.io/forwardfig/docs/export/) ·
[Drawing core](https://frinfo702.github.io/forwardfig/docs/drawing-core/) ·
[API reference](https://frinfo702.github.io/forwardfig/docs/api/) ·
[Changelog](https://frinfo702.github.io/forwardfig/docs/changelog/)

## Development

```sh
bun install && bun test && bun run build
python3 -m http.server   # then open /demo/
bun run docs:dev         # docs at http://localhost:4321
```

Pushing to `main` deploys the demo and docs to GitHub Pages.

## License

MIT
