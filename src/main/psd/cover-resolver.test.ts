import { describe, it, expect, afterEach, vi } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { resolveCover } from './cover-resolver'
import { buildLayeredPsd, buildPsdWithComposite, buildDroppedTree, buildSidecarImage } from './__fixtures__/build'

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

  it('draws the cover of a PSB (Large Document Format) from its composite the same way (H-12)', async () => {
    const dir = tempDir()
    const psbPath = join(dir, 'original.psb')
    buildLayeredPsd(psbPath, { layers: 2, psb: true })

    const result = await resolveCover({ psdPath: psbPath, candidateImagePaths: [], outDir: join(dir, 'out') })

    expect(result.source).toBe('embedded')
    if (result.source === 'embedded') expect(existsSync(result.coverPath)).toBe(true)
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

describe('resolveCover — who reads the composite', () => {
  it('reads the PSD’s composite with the reader it is given, as the app’s worker does', async () => {
    const dir = tempDir()
    const pixels = Buffer.alloc(800 * 600 * 4)
    for (let i = 0; i < pixels.length; i++) pixels[i] = i % 4 === 3 ? 255 : (i * 7) % 256
    const readEmbedded = vi.fn(async () => ({ data: pixels, width: 800, height: 600 }))

    const result = await resolveCover({
      psdPath: join(dir, 'not-on-disk.psd'),
      candidateImagePaths: [],
      outDir: join(dir, 'out'),
      readEmbedded
    })

    expect(readEmbedded).toHaveBeenCalledWith(join(dir, 'not-on-disk.psd'))
    expect(result.source).toBe('embedded')
    if (result.source === 'embedded') expect(existsSync(result.coverPath)).toBe(true)
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
  it('reads the copy for its preview and matches sidecars against where the PSD came from', async () => {
    const dir = tempDir()
    const { psdPaths, jpgPaths } = await buildDroppedTree(dir)
    const copyDir = join(dir, 'library', 'mockups', 'x')
    mkdirSync(copyDir, { recursive: true })
    const copy = join(copyDir, 'original.psd')
    copyFileSync(psdPaths[0]!, copy)

    const result = await resolveCover({
      psdPath: copy,
      sidecarFor: psdPaths[0]!,
      candidateImagePaths: jpgPaths,
      outDir: join(dir, 'out'),
    })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'Artboard A.jpg' })
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

describe('resolveCover — placeholder composite', () => {
  // The sidecar fixture is brown (128, 64, 32); the placeholder card is white.
  const isSidecarColour = async (coverPath: string) => {
    const { channels } = await sharp(coverPath).stats()
    return channels[0]!.mean > 100 && channels[0]!.mean < 160 && channels[2]!.mean < 60
  }

  async function folder(psdName: string, look: 'placeholder' | 'photo', images: string[]) {
    const dir = tempDir()
    const psdPath = join(dir, 'Kit', psdName)
    buildPsdWithComposite(psdPath, { look })
    const imagePaths: string[] = []
    for (const image of images) {
      const path = join(dir, 'Kit', image)
      await buildSidecarImage(path)
      imagePaths.push(path)
    }
    return { psdPath, imagePaths, outDir: join(dir, 'out') }
  }

  it('uses the image with the PSD’s own name in place of a placeholder', async () => {
    const { psdPath, imagePaths, outDir } = await folder('iPhone_Mockup_1.psd', 'placeholder', [
      'iPhone_Mockup_1.jpg',
      'iPhone_Mockup_2.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'iPhone_Mockup_1.jpg' })
    if (result.source === 'sidecar') expect(await isSidecarColour(result.coverPath)).toBe(true)
  })

  it('uses a lone preview.jpg beside a placeholder', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Business-Cards.psd', 'placeholder', [
      'preview.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'preview.jpg' })
  })

  it('uses the only image in the folder when its name is close but not the same', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Bus_Stop_Mockup.psd', 'placeholder', [
      'Bus_Stop_Mockup_1.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'Bus_Stop_Mockup_1.jpg' })
  })

  it('prefers preview.jpg among other images in the folder', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Cards.psd', 'placeholder', [
      'detail.png',
      'preview.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'preview.jpg' })
  })

  it('keeps the placeholder when several images could be the preview', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Top&Leggings_Mockup.psd', 'placeholder', [
      'Top_Mockup.jpg',
      'Leggings_Mockup.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result.source).toBe('embedded')
  })

  it('keeps the placeholder when the only image is in another folder', async () => {
    const { psdPath, outDir } = await folder('Scene 02.psd', 'placeholder', [])
    const elsewhere = join(psdPath, '..', '..', 'Preview', 'Scene #2.png')
    await buildSidecarImage(elsewhere, { format: 'png' })

    const result = await resolveCover({ psdPath, candidateImagePaths: [elsewhere], outDir })

    expect(result.source).toBe('embedded')
  })

  it('keeps a real composite even with an image of the same name beside it', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Can_Mockup.psd', 'photo', [
      'Can_Mockup.jpg'
    ])

    const result = await resolveCover({ psdPath, candidateImagePaths: imagePaths, outDir })

    expect(result.source).toBe('embedded')
    if (result.source === 'embedded') expect(await isSidecarColour(result.coverPath)).toBe(false)
  })

  it('reads the preview through readImage, for images that are not files on disk', async () => {
    const { psdPath, imagePaths, outDir } = await folder('Pouch.psd', 'placeholder', ['Pouch.jpg'])
    const bytes = readFileSync(imagePaths[0]!)
    const inZip = '/drop/Pouch.zip/Kit/Pouch.jpg'

    const result = await resolveCover({
      psdPath,
      sidecarFor: '/drop/Pouch.zip/Kit/Pouch.psd',
      candidateImagePaths: [inZip],
      readImage: async (path) => {
        expect(path).toBe(inZip)
        return bytes
      },
      outDir
    })

    expect(result).toMatchObject({ source: 'sidecar', candidateName: 'Pouch.jpg' })
  })

  it('keeps the placeholder when the preview cannot be read', async () => {
    const { psdPath, outDir } = await folder('Mug.psd', 'placeholder', [])
    const broken = join(psdPath, '..', 'Mug.jpg')
    mkdirSync(join(broken, '..'), { recursive: true })
    writeFileSync(broken, 'not a jpeg')

    const result = await resolveCover({ psdPath, candidateImagePaths: [broken], outDir })

    expect(result.source).toBe('embedded')
  })
})
