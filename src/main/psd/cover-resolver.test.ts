import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCover } from './cover-resolver'
import { buildPsdWithComposite, buildDroppedTree } from './__fixtures__/build'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-resolver-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resolveCover — embedded branch', () => {
  it('returns source=embedded when PSD has a good composite', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'design.psd')
    buildPsdWithComposite(psdPath, { width: 1024, height: 768 })
    const outDir = join(dir, 'out')

    const result = await resolveCover({
      psdPath,
      candidateImagePaths: [],
      outDir,
    })

    expect(result.source).toBe('embedded')
    if (result.source === 'embedded') {
      expect(existsSync(result.coverPath)).toBe(true)
      expect(existsSync(result.thumbPath)).toBe(true)
    }
  })

  it('writes cover.webp and thumb.webp for embedded result', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'design.psd')
    buildPsdWithComposite(psdPath, { width: 800, height: 600 })
    const outDir = join(dir, 'out')

    const result = await resolveCover({ psdPath, candidateImagePaths: [], outDir })

    if (result.source === 'embedded') {
      expect(result.coverPath).toMatch(/cover\.webp$/)
      expect(result.thumbPath).toMatch(/thumb\.webp$/)
    }
  })
})

describe('resolveCover — sidecar branch', () => {
  it('returns source=sidecar when embedded is absent but sidecar candidate exists', async () => {
    const dir = tempDir()
    const { psdPaths, jpgPaths } = await buildDroppedTree(dir)
    const psdPath = psdPaths[0]!
    const outDir = join(dir, 'out')

    const result = await resolveCover({
      psdPath,
      candidateImagePaths: jpgPaths,
      outDir,
    })

    expect(result.source).toBe('sidecar')
    if (result.source === 'sidecar') {
      expect(existsSync(result.coverPath)).toBe(true)
      expect(existsSync(result.thumbPath)).toBe(true)
      expect(result.candidateName).toBe('Artboard A.jpg')
      expect(result.confidence).toBe(1.0)
    }
  })
})

describe('resolveCover — none branch', () => {
  it('returns source=none when embedded is absent and no sidecar candidate matches', async () => {
    const dir = tempDir()
    // Use a PSD with small composite (unusable embedded)
    const { psdPaths } = await buildDroppedTree(dir)
    const psdPath = psdPaths[0]!
    const outDir = join(dir, 'out')

    // Pass empty candidate list — no sidecar
    const result = await resolveCover({
      psdPath,
      candidateImagePaths: [],
      outDir,
    })

    expect(result.source).toBe('none')
  })

  it('writes no files for the none result', async () => {
    const dir = tempDir()
    const { psdPaths } = await buildDroppedTree(dir)
    const outDir = join(dir, 'out')

    const result = await resolveCover({
      psdPath: psdPaths[0]!,
      candidateImagePaths: [],
      outDir,
    })

    expect(result.source).toBe('none')
    expect(existsSync(join(outDir, 'cover.webp'))).toBe(false)
    expect(existsSync(join(outDir, 'thumb.webp'))).toBe(false)
  })
})
