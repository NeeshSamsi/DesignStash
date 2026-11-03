import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPsd } from 'ag-psd'
import { readCompositeSections, readEmbeddedPreview } from './embedded'
import { buildLayeredPsd, buildPsdWithComposite, buildPsdSmallComposite } from './__fixtures__/build'

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

describe('reading only what the composite needs', () => {
  /** ag-psd's own read of the whole file: what the composite should come out as. */
  const wholeFileComposite = (path: string) => {
    const bytes = readFileSync(path)
    const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
      skipLayerImageData: true,
      skipCompositeImageData: false,
      useImageData: true
    })
    return Buffer.from(psd.imageData!.data.buffer)
  }

  it('leaves the layers’ pixels on disk and gives the same composite as reading the whole file', async () => {
    const psdPath = join(tempDir(), 'layered.psd')
    buildLayeredPsd(psdPath, { layers: 3 })

    const sections = await readCompositeSections(psdPath)
    const preview = await readEmbeddedPreview(psdPath)

    expect(sections.bytes.byteLength).toBeLessThan(statSync(psdPath).size / 2)
    expect(preview!.data.equals(wholeFileComposite(psdPath))).toBe(true)
  })

  it('reads a Large Document Format file (.psb) the same way', async () => {
    const psdPath = join(tempDir(), 'layered.psb')
    buildLayeredPsd(psdPath, { layers: 2, psb: true })

    const preview = await readEmbeddedPreview(psdPath)

    expect(preview).toMatchObject({ width: 1024, height: 768 })
    expect(preview!.data.equals(wholeFileComposite(psdPath))).toBe(true)
  })

  it('treats a see-through composite as reading the whole file does', async () => {
    const psdPath = join(tempDir(), 'clear.psd')
    buildLayeredPsd(psdPath, { layers: 1, transparent: true })

    const preview = await readEmbeddedPreview(psdPath)

    expect(preview!.data.equals(wholeFileComposite(psdPath))).toBe(true)
  })

  it('refuses a file that is not a PSD', async () => {
    const path = join(tempDir(), 'fake.psd')
    writeFileSync(path, 'not a photoshop file at all, just text')
    await expect(readEmbeddedPreview(path)).rejects.toThrow()
  })
})
