#!/usr/bin/env node
/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { THEMES } from './render'

// forwardfig <file> [-o out.svg]: import a module, write its figure(s) as SVG.
// default export: a Figure (or a function returning one) → -o file, else stdout.
// no default export: every named Figure → <name>.svg in the -o directory (default: here).

const HELP = `Usage: forwardfig <file> [-o out.svg] [--theme light|dark]

Renders the module's default export (a Figure, or a function returning one) as SVG,
to the -o file or to stdout. Without a default export, every exported Figure is
written as <name>.svg into the -o directory (default: the current directory).

Options:
  -o, --out <path>   output file (default export) or directory (named exports)
      --theme <name> ${Object.keys(THEMES).join(' | ')} (default: the figure's own)
  -h, --help         show this help

.ts files need Node >= 22.6 (with --experimental-strip-types before 23.6) or Bun.`

type Fig = { svg(options?: { theme?: string }): string }
const isFig = (x: unknown): x is Fig => typeof (x as Fig | undefined)?.svg === 'function'

function fail(msg: string): never {
  process.stderr.write(`forwardfig: ${msg}\n`)
  process.exit(1)
}

async function main() {
  let args
  try {
    args = parseArgs({ allowPositionals: true, options: { out: { type: 'string', short: 'o' }, theme: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  } catch (e) { fail(`${(e as Error).message}\n\n${HELP}`) }
  const { values: o, positionals } = args
  if (o.help) return void process.stdout.write(HELP + '\n')
  if (positionals.length !== 1) fail(`expected one input file\n\n${HELP}`)
  if (o.theme && !(o.theme in THEMES)) fail(`unknown theme "${o.theme}" (${Object.keys(THEMES).join(', ')})`)

  let mod: Record<string, unknown>
  try {
    mod = await import(pathToFileURL(resolve(positionals[0])).href)
  } catch (e) { fail(`cannot import ${positionals[0]}: ${(e as Error).message}`) }

  const svg = (f: Fig) => f.svg({ theme: o.theme })
  if (mod.default !== undefined) {
    const f = typeof mod.default === 'function' && !isFig(mod.default) ? await mod.default() : mod.default
    if (!isFig(f)) fail(`the default export of ${positionals[0]} is not a Figure`)
    if (o.out) writeFileSync(o.out, svg(f))
    else process.stdout.write(svg(f))
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

main().catch(e => fail((e as Error)?.stack ?? String(e)))
