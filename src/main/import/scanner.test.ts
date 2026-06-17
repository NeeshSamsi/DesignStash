import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join, resolve } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { scanForPsds } from './scanner'

const TEST_DIR = resolve('tmp', 'scanner-test')

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('scanForPsds', () => {
  it('finds PSDs in nested folders and captures folderTrail', () => {
    // Setup
    const nestedDir = join(TEST_DIR, 'nested')
    mkdirSync(join(nestedDir, 'sub'), { recursive: true })
    writeFileSync(join(nestedDir, 'file1.psd'), '')
    writeFileSync(join(nestedDir, 'sub', 'file2.psd'), '')
    writeFileSync(join(nestedDir, 'sub', 'ignore.txt'), '')

    const result = scanForPsds([nestedDir])

    expect(result.psds).toHaveLength(2)
    expect(result.skippedCount).toBe(1)
    expect(result.psds.map((p) => p.importContext.originalFileName).sort()).toEqual([
      'file1.psd',
      'file2.psd'
    ])

    const file1 = result.psds.find((p) => p.importContext.originalFileName === 'file1.psd')
    expect(file1?.importContext.folderTrail).toEqual([])

    const file2 = result.psds.find((p) => p.importContext.originalFileName === 'file2.psd')
    expect(file2?.importContext.folderTrail).toEqual(['sub'])
  })

  it('handles single dropped PSD file', () => {
    const singlePsd = join(TEST_DIR, 'single.psd')
    writeFileSync(singlePsd, '')

    const result = scanForPsds([singlePsd])

    expect(result.psds).toHaveLength(1)
    expect(result.skippedCount).toBe(0)
    expect(result.psds[0]!.importContext.originalFileName).toBe('single.psd')
    expect(result.psds[0]!.importContext.folderTrail).toEqual([])
  })

  it('collects candidate images from the dropped tree', () => {
    const sidecarDir = join(TEST_DIR, 'sidecar-test')
    mkdirSync(join(sidecarDir, 'previews'), { recursive: true })
    writeFileSync(join(sidecarDir, 'design.psd'), '')
    writeFileSync(join(sidecarDir, 'previews', 'design.jpg'), '')
    writeFileSync(join(sidecarDir, 'other.txt'), '')

    const result = scanForPsds([sidecarDir])

    expect(result.candidateImagePaths).toHaveLength(1)
    expect(result.candidateImagePaths[0]).toContain('design.jpg')
  })
})
