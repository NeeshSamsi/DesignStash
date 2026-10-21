import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ds-helper-build-'))
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const build = (...args: string[]) =>
  execFileSync('node', ['scripts/build-helper.mjs', ...args], { encoding: 'utf8' })

describe.runIf(process.platform === 'darwin' && process.arch === 'arm64')(
  'build-helper.mjs',
  () => {
    it('installs a given binary in the dev folder, executable', () => {
      const from = join(base, 'designstash-helper')
      writeFileSync(from, '#!/bin/sh\n', { mode: 0o644 })
      const to = join(base, 'dev')

      const out = build('--from', from, '--to', to)

      expect(out).toContain(`Helper ready at ${join(to, 'designstash-helper')}`)
      expect(statSync(join(to, 'designstash-helper')).mode & 0o111).not.toBe(0)
    })

    it('replaces an installed copy with a new file, and stages a copy when asked', () => {
      const from = join(base, 'designstash-helper')
      writeFileSync(from, 'new')
      const to = join(base, 'dev')
      build('--from', from, '--to', to)
      const before = statSync(join(to, 'designstash-helper')).ino

      const out = build('--from', from, '--to', to, '--stage', join(base, 'stage'))

      // A new file, so a helper running from the old one isn't changed under it.
      expect(statSync(join(to, 'designstash-helper')).ino).not.toBe(before)
      expect(readFileSync(join(base, 'stage', 'designstash-helper'), 'utf8')).toBe('new')
      expect(out).toContain('Staged helper in')
    })

    it('fails when the given binary is missing', () => {
      expect(() => build('--from', join(base, 'nope'), '--to', join(base, 'dev'))).toThrow()
    })
  }
)
