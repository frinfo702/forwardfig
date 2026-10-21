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

test('cli: errors exit non-zero with a message', () => {
  const r = cli(fixture('figure.ts'), '--theme', 'neon')
  expect(r.exitCode).toBe(1)
  expect(r.stderr.toString()).toContain('unknown theme "neon"')
  expect(cli().exitCode).toBe(1)
  expect(cli('missing.ts').stderr.toString()).toContain('cannot import missing.ts')
})
