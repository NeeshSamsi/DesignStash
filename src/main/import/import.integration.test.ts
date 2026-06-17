import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join, resolve } from 'node:path'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { ImportService } from './import-service'
import { Repository } from '../db/repository'
import { initDb, closeDb } from '../db/connection'
import { runMigrations } from '../db/migrate'
import { buildPsdWithComposite, buildSidecarImage } from '../psd/__fixtures__/build'
import { writePsdBuffer } from 'ag-psd'

const TEST_DIR = resolve('tmp', 'import-integration-test')
const LIBRARY_ROOT = join(TEST_DIR, 'Library')

beforeAll(() => {
  mkdirSync(LIBRARY_ROOT, { recursive: true })
})

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
  closeDb()
})

describe('Import Integration', () => {
  it('runs the full import pipeline against a mixed tree', async () => {
    const db = initDb(join(LIBRARY_ROOT, 'designstash.db'))
    runMigrations(db, resolve('drizzle'))
    const repo = new Repository(db)
    const service = new ImportService(repo, LIBRARY_ROOT)

    // Setup test files
    const importRoot = join(TEST_DIR, 'import-root')
    const nestedDir = join(importRoot, 'nested')
    mkdirSync(nestedDir, { recursive: true })

    // 1. PSD with embedded composite
    buildPsdWithComposite(join(importRoot, 'embedded.psd'), { width: 600, height: 600 });

    // 2. PSD with small composite + sidecar
    const sidecarPsdPath = join(nestedDir, 'sidecar.psd');
    const sidecarPsd = { width: 20, height: 20, children: [] };
    const sidecarPsdBuffer = writePsdBuffer(sidecarPsd);
    writeFileSync(sidecarPsdPath, sidecarPsdBuffer);
    await buildSidecarImage(join(nestedDir, 'sidecar.jpg'));

    // 3. PSD with no usable cover
    const noCoverPsdPath = join(importRoot, 'no-cover.psd');
    const noCoverPsd = { width: 10, height: 10, children: [] };
    const noCoverPsdBuffer = writePsdBuffer(noCoverPsd);
    writeFileSync(noCoverPsdPath, noCoverPsdBuffer);

    // 4. Noise file
    writeFileSync(join(importRoot, 'noise.txt'), 'hello')

    const summary = await service.importPaths([importRoot], {})

    expect(summary.imported).toBe(2)
    expect(summary.pendingPreview).toBe(1)
    expect(summary.duplicates).toBe(0)
    expect(summary.errors).toBe(0)
    expect(summary.skippedNonPsd).toBe(2)

    // Verify files were created
    const mockups = repo.getAllMockups()
    expect(mockups.length).toBe(2)
    for (const mockup of mockups) {
      expect(existsSync(mockup.libraryPath)).toBe(true)
      expect(existsSync(mockup.coverPath)).toBe(true)
    }
    
    // Test duplication
    const summary2 = await service.importPaths([importRoot], {})
    expect(summary2.duplicates).toBe(2)
    expect(summary2.imported).toBe(0)
  })
})
