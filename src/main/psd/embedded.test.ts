import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEmbeddedPreview } from './embedded'
import { buildPsdWithComposite, buildPsdSmallComposite } from './__fixtures__/build'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-emb-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('readEmbeddedPreview', () => {
  it('returns RawImage with correct dimensions for a PSD with ≥512px composite', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'good.psd')
    buildPsdWithComposite(psdPath, { width: 1024, height: 768 })

    const result = await readEmbeddedPreview(psdPath)

    expect(result).not.toBeNull()
    expect(result!.width).toBe(1024)
    expect(result!.height).toBe(768)
    expect(result!.data).toBeInstanceOf(Buffer)
    expect(result!.data.length).toBe(1024 * 768 * 4)
  })

  it('returns null for a PSD with composite smaller than MIN_EMBEDDED_EDGE (512)', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'small.psd')
    buildPsdSmallComposite(psdPath)

    const result = await readEmbeddedPreview(psdPath)

    expect(result).toBeNull()
  })

  it('returns RawImage for a square PSD whose side equals MIN_EMBEDDED_EDGE exactly', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'exact.psd')
    buildPsdWithComposite(psdPath, { width: 512, height: 512 })

    const result = await readEmbeddedPreview(psdPath)

    expect(result).not.toBeNull()
    expect(result!.width).toBe(512)
    expect(result!.height).toBe(512)
  })

  it('uses long edge for threshold check — tall PSD with height ≥512 passes', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'tall.psd')
    buildPsdWithComposite(psdPath, { width: 100, height: 600 })

    const result = await readEmbeddedPreview(psdPath)

    expect(result).not.toBeNull()
    expect(result!.width).toBe(100)
    expect(result!.height).toBe(600)
  })

  it('handles a large composite (2048×1536) and returns correct dims', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'large.psd')
    buildPsdWithComposite(psdPath, { width: 2048, height: 1536 })

    const result = await readEmbeddedPreview(psdPath)

    expect(result).not.toBeNull()
    expect(result!.width).toBe(2048)
    expect(result!.height).toBe(1536)
    expect(result!.data.length).toBe(2048 * 1536 * 4)
  })
})
