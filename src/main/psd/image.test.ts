import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { generateCoverFromRaw, generateCoverFromFile } from './image'
import { buildSidecarImage } from './__fixtures__/build'
import { COVER_MAX_EDGE, THUMB_MAX_EDGE } from '@shared/constants'
import type { RawImage } from './types'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-img-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function makeRaw(width: number, height: number): RawImage {
  const data = Buffer.alloc(width * height * 4, 128)
  return { data, width, height }
}

describe('generateCoverFromRaw', () => {
  it('produces cover.png and thumb.webp in outDir', async () => {
    const dir = tempDir()
    const outDir = join(dir, 'out')
    const { coverPath, thumbPath } = await generateCoverFromRaw(makeRaw(800, 600), outDir)

    expect(existsSync(coverPath)).toBe(true)
    expect(existsSync(thumbPath)).toBe(true)
    expect(coverPath).toBe(join(outDir, 'cover.png'))
    expect(thumbPath).toBe(join(outDir, 'thumb.webp'))
  })

  it('cover is valid PNG with correct format', async () => {
    const dir = tempDir()
    const { coverPath } = await generateCoverFromRaw(makeRaw(800, 600), join(dir, 'out'))
    const meta = await sharp(coverPath).metadata()
    expect(meta.format).toBe('png')
  })

  it('thumb is valid WebP with correct format', async () => {
    const dir = tempDir()
    const { thumbPath } = await generateCoverFromRaw(makeRaw(800, 600), join(dir, 'out'))
    const meta = await sharp(thumbPath).metadata()
    expect(meta.format).toBe('webp')
  })

  it('downscales oversized input — long edge ≤ COVER_MAX_EDGE', async () => {
    const dir = tempDir()
    const w = 4000
    const h = 3000
    const { coverPath } = await generateCoverFromRaw(makeRaw(w, h), join(dir, 'out'))
    const meta = await sharp(coverPath).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(COVER_MAX_EDGE)
  })

  it('does NOT upscale small input', async () => {
    const dir = tempDir()
    const w = 200
    const h = 150
    const { coverPath } = await generateCoverFromRaw(makeRaw(w, h), join(dir, 'out'))
    const meta = await sharp(coverPath).metadata()
    expect(meta.width).toBe(w)
    expect(meta.height).toBe(h)
  })

  it('thumb long edge ≤ THUMB_MAX_EDGE', async () => {
    const dir = tempDir()
    const { thumbPath } = await generateCoverFromRaw(makeRaw(4000, 3000), join(dir, 'out'))
    const meta = await sharp(thumbPath).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(THUMB_MAX_EDGE)
  })

  it('creates outDir if it does not exist', async () => {
    const dir = tempDir()
    const outDir = join(dir, 'nested', 'out')
    await generateCoverFromRaw(makeRaw(200, 200), outDir)
    expect(existsSync(outDir)).toBe(true)
  })
})

describe('generateCoverFromFile', () => {
  it('produces cover.png and thumb.webp from a JPEG file', async () => {
    const dir = tempDir()
    const imgPath = join(dir, 'source.jpg')
    await buildSidecarImage(imgPath, { width: 800, height: 600, format: 'jpeg' })

    const outDir = join(dir, 'out')
    const { coverPath, thumbPath } = await generateCoverFromFile(imgPath, outDir)

    expect(existsSync(coverPath)).toBe(true)
    expect(existsSync(thumbPath)).toBe(true)
  })

  it('downscales oversized file — long edge ≤ COVER_MAX_EDGE', async () => {
    const dir = tempDir()
    const imgPath = join(dir, 'big.png')
    await buildSidecarImage(imgPath, { width: 4000, height: 3000, format: 'png' })

    const { coverPath } = await generateCoverFromFile(imgPath, join(dir, 'out'))
    const meta = await sharp(coverPath).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(COVER_MAX_EDGE)
  })

  it('does NOT upscale a small file', async () => {
    const dir = tempDir()
    const imgPath = join(dir, 'small.png')
    await buildSidecarImage(imgPath, { width: 200, height: 150, format: 'png' })

    const { coverPath } = await generateCoverFromFile(imgPath, join(dir, 'out'))
    const meta = await sharp(coverPath).metadata()
    expect(meta.width).toBe(200)
    expect(meta.height).toBe(150)
  })

  it('thumb long edge ≤ THUMB_MAX_EDGE from file', async () => {
    const dir = tempDir()
    const imgPath = join(dir, 'big.jpg')
    await buildSidecarImage(imgPath, { width: 4000, height: 3000, format: 'jpeg' })

    const { thumbPath } = await generateCoverFromFile(imgPath, join(dir, 'out'))
    const meta = await sharp(thumbPath).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(THUMB_MAX_EDGE)
  })
})
