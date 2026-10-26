import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(import.meta.dirname, '../stage-llama-server.mjs')

// llama-server loads its dylibs by @rpath through version links (libllama.0.dylib ->
// libllama.0.7.0.dylib). The staged folder ships inside the app, so every link has to resolve
// inside it on a tester's Mac, where the developer's fetch folder does not exist.
describe('stage-llama-server', () => {
  let root: string
  let from: string
  let to: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ds-stage-llama-'))
    const versioned = join(root, 'fetched', 'llama-b1')
    mkdirSync(versioned, { recursive: true })
    writeFileSync(join(versioned, 'llama-server'), '#!/bin/sh\n')
    writeFileSync(join(versioned, 'libllama.0.7.0.dylib'), 'lib')
    symlinkSync('libllama.0.7.0.dylib', join(versioned, 'libllama.0.dylib'))
    symlinkSync('libllama.0.dylib', join(versioned, 'libllama.dylib'))
    from = join(root, 'fetched', 'current')
    symlinkSync(versioned, from)
    to = join(root, 'staged')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const stage = () => execFileSync(process.execPath, [SCRIPT, '--from', from, '--to', to])

  it('keeps each dylib link relative, pointing at its neighbour in the staged folder', () => {
    stage()
    for (const name of ['libllama.0.dylib', 'libllama.dylib']) {
      const link = join(to, name)
      expect(lstatSync(link).isSymbolicLink()).toBe(true)
      expect(isAbsolute(readlinkSync(link))).toBe(false)
      expect(realpathSync(link)).toBe(realpathSync(join(to, 'libllama.0.7.0.dylib')))
    }
  })

  it('still resolves every link once the fetched folder is gone, as on a tester’s Mac', () => {
    stage()
    rmSync(join(root, 'fetched'), { recursive: true, force: true })
    expect(realpathSync(join(to, 'libllama.dylib'))).toBe(
      realpathSync(join(to, 'libllama.0.7.0.dylib'))
    )
  })

  it('refuses a link that points outside the folder', () => {
    writeFileSync(join(root, 'elsewhere.dylib'), 'lib')
    symlinkSync(join(root, 'elsewhere.dylib'), join(realpathSync(from), 'libggml.dylib'))
    expect(stage).toThrow()
  })
})
