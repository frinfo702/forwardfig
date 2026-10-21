#!/usr/bin/env node
/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { THEMES } from './render'

// forwardfig <file> [-o out.svg]: import a module, write its figure(s) as SVG.
// default export: a Figure (or a function returning one) → -o file (format from the extension), else stdout.
// no default export: every named Figure → <name>.svg in the -o directory (default: here).

const HELP = `Usage: forwardfig <file> [-o out.svg|.png|.jpg|.webp] [--theme light|dark]

Renders the module's default export (a Figure, or a function returning one) to the
-o file, in the format of its extension, or as SVG to stdout. Without a default export,
every exported Figure is written as <name>.svg into the -o directory (default: the
current directory).

Options:
  -o, --out <path>       output file (default export) or directory (named exports)
      --theme <name>     ${Object.keys(THEMES).join(' | ')} (default: the figure's own)
      --scale <n>        raster resolution multiplier (default 2)
      --background <css> raster background (default transparent; white for JPEG)
  -h, --help             show this help

.ts files need Node >= 22.6 (with --experimental-strip-types before 23.6) or Bun.
PNG / JPEG / WebP need sharp: npm i -D sharp`

type Fig = { svg(options?: { theme?: string }): string }
const isFig = (x: unknown): x is Fig => typeof (x as Fig | undefined)?.svg === 'function'
const RASTER = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp' } as const

function fail(msg: string): never {
  process.stderr.write(`forwardfig: ${msg}\n`)
  process.exit(1)
}

async function main() {
  let args
  try {
    args = parseArgs({ allowPositionals: true, options: {
      out: { type: 'string', short: 'o' }, theme: { type: 'string' }, scale: { type: 'string' }, background: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    } })
  } catch (e) { fail(`${(e as Error).message}\n\n${HELP}`) }
  const { values: o, positionals } = args
  if (o.help) return void process.stdout.write(HELP + '\n')
  if (positionals.length !== 1) fail(`expected one input file\n\n${HELP}`)
  if (o.theme && !(o.theme in THEMES)) fail(`unknown theme "${o.theme}" (${Object.keys(THEMES).join(', ')})`)
  const scale = Number(o.scale ?? 2)
  if (!(scale > 0)) fail(`--scale must be a positive number, got "${o.scale}"`)
  const ext = o.out && /\.(\w+)$/.exec(o.out)?.[1].toLowerCase()
  if (ext && ext !== 'svg' && !(ext in RASTER)) fail(`unknown output format ".${ext}" (svg, png, jpg, jpeg, webp)`)

  let mod: Record<string, unknown>
  try {
    mod = await import(pathToFileURL(resolve(positionals[0])).href)
  } catch (e) { fail(`cannot import ${positionals[0]}: ${(e as Error).message}`) }

  const svg = (f: Fig) => f.svg({ theme: o.theme })
  if (mod.default !== undefined) {
    const f = typeof mod.default === 'function' && !isFig(mod.default) ? await mod.default() : mod.default
    if (!isFig(f)) fail(`the default export of ${positionals[0]} is not a Figure`)
    if (!o.out) process.stdout.write(svg(f))
    else if (ext && ext in RASTER) writeFileSync(o.out, await rasterize(svg(f), RASTER[ext as keyof typeof RASTER], scale, o.background))
    else writeFileSync(o.out, svg(f))
    return
  }
  const named = Object.entries(mod).filter(([, v]) => isFig(v)) as [string, Fig][]
  if (!named.length) fail(`${positionals[0]} exports no Figure (export default a Figure, or export named Figures)`)
  for (const [name, f] of named) {
    const out = join(o.out ?? '.', `${name}.svg`)
    writeFileSync(out, svg(f))
    process.stderr.write(`wrote ${out}\n`)
  }
}

// Like toBlob() in the browser, with sharp (an optional peer dependency) in place of canvas.
async function rasterize(svg: string, format: 'png' | 'jpeg' | 'webp', scale: number, background?: string): Promise<Buffer> {
  let sharp: typeof import('sharp').default
  try {
    sharp = (await import('sharp')).default
  } catch { fail(`${format.toUpperCase()} output needs sharp: npm i -D sharp`) }
  // sharp doesn't fetch external images: inline them as data URLs (unreachable ones stay empty)
  for (const url of new Set([...svg.matchAll(/<image href="(https?:[^"]+)"/g)].map(m => m[1]))) {
    try {
      const res = await fetch(url.replace(/&amp;/g, '&'))
      const data = `data:${res.headers.get('content-type') ?? ''};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
      svg = svg.split(`href="${url}"`).join(`href="${data}"`)
    } catch { /* leave it; the frame is drawn without the picture */ }
  }
  const bg = background ?? (format === 'jpeg' ? '#ffffff' : undefined)
  const img = sharp(Buffer.from(svg), { density: 72 * scale })
  return (bg ? img.flatten({ background: bg }) : img).toFormat(format, { quality: 92 }).toBuffer()
}

main().catch(e => fail((e as Error)?.stack ?? String(e)))
