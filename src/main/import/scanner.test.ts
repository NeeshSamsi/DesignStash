import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { basename, join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { scanForPsds } from './scanner'
import { makeZip, markEncrypted, zipBytes } from './__tests__/zips'

const TEST_DIR = resolve('tmp', 'scanner-test')
const STAGING = join(TEST_DIR, '.staging')

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('scanForPsds', () => {
  it('finds PSDs in nested folders, with the dropped folder’s own name first in the trail', async () => {
    // Setup
    const nestedDir = join(TEST_DIR, 'nested')
    mkdirSync(join(nestedDir, 'sub'), { recursive: true })
    writeFileSync(join(nestedDir, 'file1.psd'), '')
    writeFileSync(join(nestedDir, 'sub', 'file2.psd'), '')
    writeFileSync(join(nestedDir, 'sub', 'ignore.txt'), '')

    const result = await scanForPsds([nestedDir], { stagingDir: STAGING })

    expect(result.psds).toHaveLength(2)
    expect(result.skippedCount).toBe(1)
    expect(result.psds.map((p) => p.importContext.originalFileName).sort()).toEqual([
      'file1.psd',
      'file2.psd'
    ])

    const file1 = result.psds.find((p) => p.importContext.originalFileName === 'file1.psd')
    expect(file1?.importContext.folderTrail).toEqual(['nested'])

    const file2 = result.psds.find((p) => p.importContext.originalFileName === 'file2.psd')
    expect(file2?.importContext.folderTrail).toEqual(['nested', 'sub'])
  })

  it('handles single dropped PSD file', async () => {
    const singlePsd = join(TEST_DIR, 'single.psd')
    writeFileSync(singlePsd, '')

    const result = await scanForPsds([singlePsd], { stagingDir: STAGING })

    expect(result.psds).toHaveLength(1)
    expect(result.skippedCount).toBe(0)
    expect(result.psds[0]!.importContext.originalFileName).toBe('single.psd')
    expect(result.psds[0]!.importContext.folderTrail).toEqual([])
  })

  it('collects candidate images from the dropped tree', async () => {
    const sidecarDir = join(TEST_DIR, 'sidecar-test')
    mkdirSync(join(sidecarDir, 'previews'), { recursive: true })
    writeFileSync(join(sidecarDir, 'design.psd'), '')
    writeFileSync(join(sidecarDir, 'previews', 'design.jpg'), '')
    writeFileSync(join(sidecarDir, 'other.txt'), '')

    const result = await scanForPsds([sidecarDir], { stagingDir: STAGING })

    expect(result.candidateImagePaths).toHaveLength(1)
    expect(result.candidateImagePaths[0]).toContain('design.jpg')
  })

  it('looks beside a dropped loose PSD only for images with its own name', async () => {
    const dir = join(TEST_DIR, 'loose-drop')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    const psd = join(dir, 'Poster Mockup.psd')
    for (const name of ['Poster Mockup.psd', 'Poster Mockup.JPG', 'poster mockup.png', 'Other.jpg', 'preview.jpg']) {
      writeFileSync(join(dir, name), '')
    }
    writeFileSync(join(dir, 'sub', 'Poster Mockup.jpg'), '')

    const result = await scanForPsds([psd], { stagingDir: STAGING })

    expect(result.candidateImagePaths.sort()).toEqual(
      [join(dir, 'Poster Mockup.JPG'), join(dir, 'poster mockup.png')].sort()
    )
  })

  describe('zips', () => {
    let n = 0
    /** A fresh folder for each test, so counts never leak between them. */
    const fresh = () => {
      const d = join(TEST_DIR, `zips-${n++}`)
      mkdirSync(d, { recursive: true })
      return d
    }

    it('turns each PSD inside a dropped zip into a scanned PSD, without extracting it', async () => {
      const d = fresh()
      const zip = await makeZip(join(d, 'Free_Cap_Mockup.zip'), [
        { name: 'Free_Cap_Mockup/Files/Free_Cap_Mockup.psd', data: 'x'.repeat(1000) },
        { name: 'Free_Cap_Mockup/Files/Back.PSD', data: 'yy' }
      ])
      const result = await scanForPsds([zip], { stagingDir: join(d, '.staging') })
      expect(result.psds).toEqual([
        {
          psdPath: join(zip, 'Free_Cap_Mockup/Files/Free_Cap_Mockup.psd'),
          archive: {
            path: zip,
            entry: 'Free_Cap_Mockup/Files/Free_Cap_Mockup.psd',
            name: 'Free_Cap_Mockup.zip',
            size: 1000
          },
          importContext: {
            originalFileName: 'Free_Cap_Mockup.psd',
            folderTrail: ['Free Cap Mockup']
          }
        },
        {
          psdPath: join(zip, 'Free_Cap_Mockup/Files/Back.PSD'),
          archive: {
            path: zip,
            entry: 'Free_Cap_Mockup/Files/Back.PSD',
            name: 'Free_Cap_Mockup.zip',
            size: 2
          },
          importContext: { originalFileName: 'Back.PSD', folderTrail: ['Free Cap Mockup'] }
        }
      ])
      expect(result.skippedCount).toBe(0)
      expect(result.skippedArchives).toEqual([])
      expect(existsSync(join(d, '.staging'))).toBe(false)
    })

    it('ignores the packaging and other files around the PSDs', async () => {
      const d = fresh()
      const zip = await makeZip(join(d, 'Cap.zip'), [
        { name: '__MACOSX/', compress: false },
        { name: '__MACOSX/._Cap.psd', data: 'apple' },
        { name: '._Cap.psd', data: 'apple' },
        { name: '.DS_Store', data: 'x' },
        { name: '🎁 Get 50% off.url', data: 'x' },
        { name: 'help.pdf', data: 'x' },
        { name: 'Cap.psd', data: 'psd' }
      ])
      const result = await scanForPsds([zip], { stagingDir: join(d, '.staging') })
      expect(result.psds.map((p) => p.importContext.originalFileName)).toEqual(['Cap.psd'])
      expect(result.skippedCount).toBe(0)
      expect(result.skippedArchives).toEqual([])
    })

    it('finds zips inside a dropped folder, with the folders before them in the trail', async () => {
      const d = fresh()
      mkdirSync(join(d, 'Hats'))
      await makeZip(join(d, 'Hats', 'Cap.zip'), [{ name: 'Files/Cap.psd', data: 'psd' }])
      writeFileSync(join(d, 'Hats', 'loose.psd'), 'psd')
      const result = await scanForPsds([d], { stagingDir: join(d, '.staging') })
      const trails = Object.fromEntries(
        result.psds.map((p) => [p.importContext.originalFileName, p.importContext.folderTrail])
      )
      expect(trails).toEqual({
        'Cap.psd': [basename(d), 'Hats', 'Cap'],
        'loose.psd': [basename(d), 'Hats']
      })
    })

    it('counts a zip with no PSD inside once, as no-psd-in-archive', async () => {
      const d = fresh()
      const zip = await makeZip(join(d, 'Fonts.zip'), [
        { name: 'a.otf', data: 'x' },
        { name: 'b.otf', data: 'x' }
      ])
      const result = await scanForPsds([zip], { stagingDir: join(d, '.staging') })
      expect(result.psds).toEqual([])
      expect(result.skippedCount).toBe(0)
      expect(result.skippedArchives).toEqual([
        { path: zip, name: 'Fonts.zip', reason: 'no-psd-in-archive' }
      ])
    })

    it('leaves .rar and .7z whole, as archive-unsupported', async () => {
      const d = fresh()
      writeFileSync(join(d, 'Pack.rar'), 'rar')
      writeFileSync(join(d, 'Pack.7z'), '7z')
      const result = await scanForPsds([d], { stagingDir: join(d, '.staging') })
      expect(result.skippedCount).toBe(0)
      expect(result.skippedArchives.map((a) => [a.name, a.reason]).sort()).toEqual([
        ['Pack.7z', 'archive-unsupported'],
        ['Pack.rar', 'archive-unsupported']
      ])
    })

    it('leaves an encrypted zip whole, as archive-unsupported', async () => {
      const d = fresh()
      const zip = await makeZip(join(d, 'Locked.zip'), [{ name: 'Cap.psd', data: 'psd' }])
      markEncrypted(zip)
      const result = await scanForPsds([zip], { stagingDir: join(d, '.staging') })
      expect(result.psds).toEqual([])
      expect(result.skippedArchives).toEqual([
        { path: zip, name: 'Locked.zip', reason: 'archive-unsupported' }
      ])
    })

    it('counts a file named .zip that is not a zip once, as unreadable', async () => {
      const d = fresh()
      writeFileSync(join(d, 'Broken.zip'), 'not a zip')
      const result = await scanForPsds([join(d, 'Broken.zip')], {
        stagingDir: join(d, '.staging')
      })
      expect(result.skippedArchives).toEqual([
        { path: join(d, 'Broken.zip'), name: 'Broken.zip', reason: 'unreadable' }
      ])
    })

    it('looks inside a zip inside the zip, one level deep, from a staged copy', async () => {
      const d = fresh()
      const inner = await zipBytes(join(d, 'inner-src.zip'), [
        { name: 'Cards/Notebook.psd', data: 'psd!' },
        { name: 'deeper.zip', data: 'never opened' }
      ])
      const outer = await makeZip(join(d, 'Free_3_Cards_Mockup.zip'), [
        {
          name: 'Free_3_Cards_Mockup/File/Free_3_Cards_Mockup.psd.zip',
          data: inner,
          compress: false
        },
        { name: '__MACOSX/Free_3_Cards_Mockup/File/._Free_3_Cards_Mockup.psd.zip', data: 'x' }
      ])
      const staging = join(d, '.staging')
      const result = await scanForPsds([outer], { stagingDir: staging })
      expect(result.psds).toHaveLength(1)
      const [psd] = result.psds
      expect(psd!.archive!.path.startsWith(staging)).toBe(true)
      expect(readFileSync(psd!.archive!.path).equals(inner)).toBe(true)
      expect(psd!.archive).toMatchObject({
        entry: 'Cards/Notebook.psd',
        name: 'Free_3_Cards_Mockup.zip',
        size: 4
      })
      expect(psd!.importContext).toEqual({
        originalFileName: 'Notebook.psd',
        folderTrail: ['Free 3 Cards Mockup', 'Cards']
      })
      expect(result.skippedArchives).toEqual([])
    })

    it('counts an outer zip whose only inner zip has no PSD as no-psd-in-archive', async () => {
      const d = fresh()
      const inner = await zipBytes(join(d, 'inner-src.zip'), [{ name: 'a.txt', data: 'x' }])
      const outer = await makeZip(join(d, 'Outer.zip'), [{ name: 'inner.zip', data: inner }])
      const result = await scanForPsds([outer], { stagingDir: join(d, '.staging') })
      expect(result.psds).toEqual([])
      expect(result.skippedArchives).toEqual([
        { path: outer, name: 'Outer.zip', reason: 'no-psd-in-archive' }
      ])
    })

    it('does not walk the folder around a dropped zip for cover images', async () => {
      const d = fresh()
      writeFileSync(join(d, 'Cap.jpg'), 'jpg')
      const zip = await makeZip(join(d, 'Cap.zip'), [{ name: 'Cap.psd', data: 'psd' }])
      const result = await scanForPsds([zip], { stagingDir: join(d, '.staging') })
      expect(result.candidateImagePaths).toEqual([])
    })
  })
})
