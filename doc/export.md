---
title: Export
group: Guide
order: 7
description: SVG strings, PNG / JPEG / WebP files, and how external images are handled.
---

# Export

```ts
fig.svg()                                         // an SVG string; works in Node
await fig.download('figure.png')                  // the format follows the extension
await fig.download('figure.png', { scale: 3 })    // raster resolution
const blob = await fig.toBlob({ format: 'webp', quality: 0.9, background: '#fff', theme: 'dark' })
```

| Option | Default | What it does |
| --- | --- | --- |
| `format` | from the file name, else `'svg'` | `'svg'`, `'png'`, `'jpeg'` or `'webp'`. `.jpg` means JPEG. |
| `theme` | the figure's | `'light'` or `'dark'`. |
| `scale` | `2` | Raster resolution multiplier. |
| `background` | transparent; white for JPEG | Raster background. The dark theme draws its own. |
| `quality` | `0.92` | JPEG / WebP quality, 0–1. |

- Raster formats need a browser (canvas). External image URLs are inlined as data URLs first, so they show up in the file.
- PDF is not supported. For papers, the SVG goes into LaTeX through Inkscape or `svg2pdf`.

## Command line

```ts
// model.ts
import { figure, linear } from 'forwardfig'
export default figure(fig => linear('Linear')(fig.input('x')))
```

```sh
npx forwardfig model.ts -o fig.svg     # the default export, to fig.svg
npx forwardfig model.ts -o fig.png     # the format follows the extension; raster needs sharp
npx forwardfig model.ts > fig.svg      # without -o, SVG to stdout
npx forwardfig figures.ts -o figs/     # no default export: each exported Figure → figs/<name>.svg
```

| Option | What it does |
| --- | --- |
| `-o`, `--out` | Output file: `.svg`, `.png`, `.jpg` / `.jpeg` or `.webp`. A directory for named exports (default: stdout / the current directory). |
| `--theme` | `light` or `dark`; default: the figure's. |
| `--scale` | Raster resolution multiplier; default `2`. |
| `--background` | Raster background; default transparent, white for JPEG. |
| `-h`, `--help` | Usage. |

- The default export is a `Figure` or a function (sync or async) that returns one.
- PNG / JPEG / WebP are rendered by [sharp](https://sharp.pixelplumbing.com), an optional peer dependency: `npm i -D sharp`. Without it the command exits with that hint. Named exports are always written as SVG.
- In Node there is no WebGL, so 🧊 / 🔥 materials use the vector look. External image URLs are fetched and inlined, so they must be reachable (`http(s)` URLs) or already be data URLs; relative paths are not resolved.
- `.ts` files need Node 22.6 or later: Node 23.6+ strips types by default, 22.6–23.5 need `NODE_OPTIONS=--experimental-strip-types`. Bun runs them as they are (`bun node_modules/forwardfig/dist/cli.js model.ts`). Or write the module as `.js` / `.mjs`.
- Errors (no such file, no Figure exported, unknown theme) exit with status 1 and a message on stderr.
