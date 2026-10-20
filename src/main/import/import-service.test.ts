import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { join, resolve } from 'node:path'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { ImportService } from './import-service'
import { Repository } from '../db/repository'
import { initDb, closeDb } from '../db/connection'
import { runMigrations } from '../db/migrate'
import { buildPsdWithComposite, buildSidecarImage } from '../psd/__fixtures__/build'
import { writePsdBuffer } from 'ag-psd'

const TEST_DIR = resolve('tmp', 'import-service-test')
const LIBRARY_ROOT = join(TEST_DIR, 'Library')

beforeAll(() => {
  mkdirSync(LIBRARY_ROOT, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  closeDb()
})

describe('ImportService', () => {
  it('imports psds, skips duplicates, and handles errors', async () => {
    const db = initDb(join(LIBRARY_ROOT, 'designstash.db'))
    runMigrations(db, resolve('drizzle'))
    const repo = new Repository(db)
    const service = new ImportService(repo, LIBRARY_ROOT)

    // Setup test files
    const importRoot = join(TEST_DIR, 'import-root')
    mkdirSync(join(importRoot, 'nested'), { recursive: true })

    const embeddedPsdPath = join(importRoot, 'embedded.psd');
    buildPsdWithComposite(embeddedPsdPath, { width: 600, height: 600 });

    const sidecarPsdPath = join(importRoot, 'nested', 'sidecar.psd');
    const sidecarPsd = {
      width: 20,
      height: 20,
      children: [],
    }
    const sidecarPsdBuffer = writePsdBuffer(sidecarPsd)
    writeFileSync(sidecarPsdPath, sidecarPsdBuffer);
    await buildSidecarImage(join(importRoot, 'nested', 'sidecar.jpg'));
    
    const noCoverPsdPath = join(importRoot, 'no-cover.psd');
    const noCoverPsd = {
        width: 10,
        height: 10,
        children: []
    }
    const noCoverPsdBuffer = writePsdBuffer(noCoverPsd)
    writeFileSync(noCoverPsdPath, noCoverPsdBuffer);
    
    writeFileSync(join(importRoot, 'not-a-psd.txt'), 'hello')

    const onProgress = vi.fn()
    const summary = await service.importPaths([importRoot], { onProgress })

    expect(summary.imported).toBe(2)
    expect(summary.pendingPreview).toBe(1)
    expect(summary.duplicates).toBe(0)
    expect(summary.errors).toBe(0)
    expect(summary.skippedNonPsd).toBe(2)

    // check progress calls
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'scanning' })
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'copying' })
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'done' })
    )

    // Check db
    const mockups = repo.getAllMockups()
    expect(mockups.length).toBe(2)

    const embedded = mockups.find(m => m.title === 'embedded')
    expect(embedded).toBeDefined()
    expect(embedded?.coverSource).toBe('embedded')
    expect(embedded?.contentHash).toBeDefined()
    expect(embedded?.importContext).toBeDefined()

    const sidecar = mockups.find(m => m.title === 'sidecar')
    expect(sidecar).toBeDefined()
    expect(sidecar?.coverSource).toBe('sidecar')

    // Everything imported waits in To sort, with the size of its copy in the stash folder.
    for (const m of mockups) {
      expect(m.stage).toBe('to_sort')
      expect(m.sizeBytes).toBe(statSync(m.libraryPath).size)
      expect(m.sizeBytes).toBeGreaterThan(0)
    }
    
    // Test duplication
    const summary2 = await service.importPaths([importRoot], {})
    expect(summary2.duplicates).toBe(2)
    expect(summary2.imported).toBe(0)
  })
})
