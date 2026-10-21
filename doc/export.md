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
