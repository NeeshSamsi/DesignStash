import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { copyWithHash } from './stream-copy'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-stream-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('copyWithHash', () => {
  it('copies the bytes exactly and returns their SHA-256 from the same pass', async () => {
    const data = Buffer.alloc(3 * 1024 * 1024 + 123, 7)
    writeFileSync(join(dir, 'a.psd'), data)

    const res = await copyWithHash(join(dir, 'a.psd'), join(dir, 'b.psd'))

    expect(readFileSync(join(dir, 'b.psd')).equals(data)).toBe(true)
    expect(res).toEqual({ sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length })
  })

  it('reports growing byte counts in several steps, ending at the file size', async () => {
    const data = Buffer.alloc(5 * 1024 * 1024, 1)
    writeFileSync(join(dir, 'a.psd'), data)
    const seen: number[] = []

    await copyWithHash(join(dir, 'a.psd'), join(dir, 'b.psd'), (n) => seen.push(n))

    expect(seen.length).toBeGreaterThanOrEqual(5)
    expect(seen).toEqual([...seen].sort((x, y) => x - y))
    expect(seen.at(-1)).toBe(data.length)
  })

  it('copies an empty file', async () => {
    writeFileSync(join(dir, 'empty.psd'), '')
    expect(await copyWithHash(join(dir, 'empty.psd'), join(dir, 'copy.psd'))).toMatchObject({ bytes: 0 })
    expect(existsSync(join(dir, 'copy.psd'))).toBe(true)
  })

  it('fails with ENOENT when the source is gone and leaves the original alone', async () => {
    await expect(copyWithHash(join(dir, 'missing.psd'), join(dir, 'b.psd'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never changes the original', async () => {
    writeFileSync(join(dir, 'a.psd'), 'keep me')
    await copyWithHash(join(dir, 'a.psd'), join(dir, 'b.psd'))
    expect(readFileSync(join(dir, 'a.psd'), 'utf8')).toBe('keep me')
  })
})
