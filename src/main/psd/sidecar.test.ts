import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectCandidateImages, normalizeStem, findSidecar } from './sidecar'
import { buildDroppedTree, buildSidecarImage } from './__fixtures__/build'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-sidecar-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('normalizeStem', () => {
  it('lowercases and trims', () => {
    expect(normalizeStem('  Hello World.psd  ')).toBe('hello world')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeStem('Artboard   A.psd')).toBe('artboard a')
  })

  it('strips extension regardless of case', () => {
    expect(normalizeStem('Design.PSD')).toBe('design')
  })

  it('handles no extension', () => {
    expect(normalizeStem('noext')).toBe('noext')
  })
})

describe('collectCandidateImages', () => {
  it('returns all image files recursively', async () => {
    const dir = tempDir()
    const subDir = join(dir, 'sub')
    mkdirSync(subDir)
    await buildSidecarImage(join(dir, 'a.jpg'), { format: 'jpeg' })
    await buildSidecarImage(join(subDir, 'b.png'), { format: 'png' })
    writeFileSync(join(dir, 'c.txt'), 'not an image')

    const candidates = collectCandidateImages(dir)
    expect(candidates).toHaveLength(2)
    expect(candidates.some((p) => p.endsWith('a.jpg'))).toBe(true)
    expect(candidates.some((p) => p.endsWith('b.png'))).toBe(true)
  })

  it('ignores files with non-image extensions', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'file.txt'), '')
    writeFileSync(join(dir, 'file.pdf'), '')
    await buildSidecarImage(join(dir, 'img.jpg'), { format: 'jpeg' })

    const candidates = collectCandidateImages(dir)
    expect(candidates).toHaveLength(1)
  })
})

describe('findSidecar — canonical dropped tree', () => {
  it('maps each PSD to its matching JPG with confidence 1.0', async () => {
    const dir = tempDir()
    const { psdPaths, jpgPaths } = await buildDroppedTree(dir)
    const candidates = collectCandidateImages(dir)

    for (let i = 0; i < psdPaths.length; i++) {
      const psdPath = psdPaths[i]!
      const expectedJpg = jpgPaths[i]!
      const match = findSidecar(psdPath, candidates)

      expect(match).not.toBeNull()
      expect(match!.confidence).toBe(1.0)
      expect(match!.path).toBe(expectedJpg)
    }
  })

  it('returns the correct candidateName (basename)', async () => {
    const dir = tempDir()
    const { psdPaths } = await buildDroppedTree(dir)
    const candidates = collectCandidateImages(dir)

    const match = findSidecar(psdPaths[0]!, candidates)
    expect(match).not.toBeNull()
    expect(match!.candidateName).toBe('Artboard A.jpg')
  })

  it('does not cross-match — each PSD picks its own JPG', async () => {
    const dir = tempDir()
    const { psdPaths, jpgPaths } = await buildDroppedTree(dir)
    const candidates = collectCandidateImages(dir)

    const matchA = findSidecar(psdPaths[0]!, candidates)
    const matchB = findSidecar(psdPaths[1]!, candidates)
    const matchC = findSidecar(psdPaths[2]!, candidates)

    expect(matchA!.path).toBe(jpgPaths[0])
    expect(matchB!.path).toBe(jpgPaths[1])
    expect(matchC!.path).toBe(jpgPaths[2])
  })
})

describe('findSidecar — fuzzy and edge cases', () => {
  it('fuzzy-matches a near-miss name beside the PSD', () => {
    // 'iphone-15-pro' and 'iphone-15-pro-max' share 12 bigrams: a Dice score of 24/28, over 0.85.
    const psdPath = '/drop/Kit A/iphone-15-pro.psd'
    const beside = '/drop/Kit A/iphone-15-pro-max.jpg'

    const match = findSidecar(psdPath, [beside])

    expect(match?.path).toBe(beside)
    expect(match!.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('never takes a near-miss name from another folder in the drop', () => {
    const psdPath = '/drop/Kit A/iphone-15-pro.psd'
    const otherKit = '/drop/Kit B/renders/iphone-15-pro-max.jpg'

    expect(findSidecar(psdPath, [otherKit])).toBeNull()
    expect(findSidecar(psdPath, [otherKit, '/drop/Kit A/iphone-15-pro-max.png'])?.path).toBe(
      '/drop/Kit A/iphone-15-pro-max.png'
    )
  })

  it('returns null for an unrelated filename', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'my-design.psd')
    const imgPath = join(dir, 'completely-different-image.jpg')
    await buildSidecarImage(imgPath, { format: 'jpeg' })

    const match = findSidecar(psdPath, [imgPath])
    expect(match).toBeNull()
  })

  it('case-insensitive exact match — uppercase PSD matches lowercase JPG', async () => {
    const dir = tempDir()
    const psdPath = join(dir, 'HERO BANNER.psd')
    const imgPath = join(dir, 'hero banner.jpg')
    await buildSidecarImage(imgPath, { format: 'jpeg' })

    const match = findSidecar(psdPath, [imgPath])
    expect(match).not.toBeNull()
    expect(match!.confidence).toBe(1.0)
  })

  it('returns null when candidateImagePaths is empty', () => {
    const match = findSidecar('/some/path/design.psd', [])
    expect(match).toBeNull()
  })

  it('prefers same-directory exact match over sibling-directory match', async () => {
    const dir = tempDir()
    const psdDir = join(dir, 'assets')
    const siblingDir = join(dir, 'exports')
    mkdirSync(psdDir, { recursive: true })
    mkdirSync(siblingDir, { recursive: true })

    const psdPath = join(psdDir, 'logo.psd')
    writeFileSync(psdPath, '')

    const sameDir = join(psdDir, 'logo.jpg')
    const siblingDir2 = join(siblingDir, 'logo.jpg')
    await buildSidecarImage(sameDir, { format: 'jpeg' })
    await buildSidecarImage(siblingDir2, { format: 'jpeg' })

    const match = findSidecar(psdPath, [siblingDir2, sameDir])
    expect(match).not.toBeNull()
    expect(match!.path).toBe(sameDir)
  })
})
