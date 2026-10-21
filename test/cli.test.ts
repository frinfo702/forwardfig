import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cli = (...args: string[]) => Bun.spawnSync(['bun', join(import.meta.dir, '../src/cli.ts'), ...args])
const fixture = (name: string) => join(import.meta.dir, 'fixtures', name)

test('cli: default export → -o file', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ff-')), 'fig.svg')
  const r = cli(fixture('figure.ts'), '-o', out, '--theme', 'dark')
  expect(r.exitCode).toBe(0)
  expect(readFileSync(out, 'utf8')).toMatch(/^<svg[\s\S]*Linear[\s\S]*<\/svg>\s*$/)
})

test('cli: named exports → <name>.svg each', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-'))
  expect(cli(fixture('named.ts'), '-o', dir).exitCode).toBe(0)
  for (const name of ['a', 'b']) expect(readFileSync(join(dir, `${name}.svg`), 'utf8')).toStartWith('<svg')
})

test('cli: -o fig.png rasterizes with sharp', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ff-')), 'fig.png')
  const r = cli(fixture('figure.ts'), '-o', out, '--scale', '1')
  expect(r.exitCode).toBe(0)
  expect([...readFileSync(out).subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
})

test('cli: raster output without sharp says how to get it', async () => {
  // a bundle outside the repo can't resolve sharp from node_modules
  const dir = mkdtempSync(join(tmpdir(), 'ff-'))
  const built = await Bun.build({ entrypoints: [join(import.meta.dir, '../src/cli.ts')], outdir: dir, target: 'node', external: ['sharp'] })
  expect(built.success).toBe(true)
  const r = Bun.spawnSync(['bun', '--no-install', join(dir, 'cli.js'), fixture('figure.ts'), '-o', join(dir, 'fig.png')])
  expect(r.exitCode).toBe(1)
  expect(r.stderr.toString()).toContain('PNG output needs sharp: npm i -D sharp')
})

test('cli: errors exit non-zero with a message', () => {
  const r = cli(fixture('figure.ts'), '--theme', 'neon')
  expect(r.exitCode).toBe(1)
  expect(r.stderr.toString()).toContain('unknown theme "neon"')
  expect(cli().exitCode).toBe(1)
  expect(cli(fixture('figure.ts'), '-o', 'fig.pdf').stderr.toString()).toContain('unknown output format ".pdf"')
  expect(cli('missing.ts').stderr.toString()).toContain('cannot import missing.ts')
})
