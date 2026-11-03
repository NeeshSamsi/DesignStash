import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveLlamaServerPath } from './provider-factory'

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'ds-stage-'))
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

const stage = (from: string, to: string) =>
  execFileSync('node', ['scripts/stage-llama-server.mjs', '--from', from, '--to', to], { encoding: 'utf8' })

describe('stage-llama-server.mjs', () => {
  it('copies the binary and its libraries, resolving the current link, and makes it executable', () => {
    const versioned = join(base, 'llama-b1')
    mkdirSync(versioned)
    writeFileSync(join(versioned, 'llama-server'), '#!/bin/sh\n', { mode: 0o644 })
    writeFileSync(join(versioned, 'libggml.dylib'), 'lib')
    symlinkSync(join(versioned, 'libggml.dylib'), join(versioned, 'libggml-base.dylib'))
    const current = join(base, 'current')
    symlinkSync(versioned, current)
    const to = join(base, 'build', 'llama-server')

    const out = stage(current, to)

    expect(out).toContain('Staged llama-server (3 files)')
    expect(readFileSync(join(to, 'libggml-base.dylib'), 'utf8')).toBe('lib')
    // A real copy, not a link back to the fetched folder.
    expect(statSync(join(to, 'libggml-base.dylib')).isFile()).toBe(true)
    expect(statSync(join(to, 'llama-server')).mode & 0o111).not.toBe(0)
  })

  it('replaces what was staged before', () => {
    const from = join(base, 'from')
    mkdirSync(from)
    writeFileSync(join(from, 'llama-server'), 'x')
    const to = join(base, 'to')
    mkdirSync(to)
    writeFileSync(join(to, 'stale.dylib'), 'old')

    stage(from, to)

    expect(existsSync(join(to, 'stale.dylib'))).toBe(false)
  })

  it('stops with a pointer to the fetch script when nothing was fetched', () => {
    let message = ''
    try {
      stage(join(base, 'nothing'), join(base, 'to'))
    } catch (err) {
      message = String((err as { stderr?: unknown }).stderr)
    }
    expect(message).toContain('fetch-llama-server.mjs')
    expect(existsSync(join(base, 'to'))).toBe(false)
  })
})

describe('packaged llama-server', () => {
  it('is found in the app resources, which is where electron-builder puts it', () => {
    const bundled = '/Applications/DesignStash.app/Contents/Resources/llama-server/llama-server'
    const found = resolveLlamaServerPath(
      {},
      '/Applications/DesignStash.app/Contents/Resources',
      '/Users/me',
      (p) => p === bundled
    )
    expect(found).toBe(bundled)
  })

  it('prefers an explicit override, then the bundled copy, then the development copy', () => {
    const exists = () => true
    expect(resolveLlamaServerPath({ DESIGNSTASH_LLAMA_SERVER: '/x/llama-server' }, '/R', '/H', exists)).toBe('/x/llama-server')
    expect(resolveLlamaServerPath({}, '/R', '/H', exists)).toBe('/R/llama-server/llama-server')
    expect(resolveLlamaServerPath({}, undefined, '/H', exists)).toContain('DesignStash-dev')
  })
})
