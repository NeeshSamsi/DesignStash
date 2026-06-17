import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import type { NewMockup } from '../db/schema'
import { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { IntegrityService, type IntegrityDeps } from './integrity-service'

const LIB = '/lib'
const mockupsDir = `${LIB}/mockups`

const row = (overrides: Partial<NewMockup> = {}): NewMockup => ({
  title: 'Test',
  libraryPath: `${mockupsDir}/a/original.psd`,
  coverPath: `${mockupsDir}/a/cover.webp`,
  coverSource: 'embedded',
  reviewStatus: 'approved',
  ...overrides
})

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  ensureSearchIndex(db)
  repo = new Repository(db)
})

afterEach(() => sqlite.close())

const makeService = (deps: Partial<IntegrityDeps>) => new IntegrityService(repo, LIB, deps)

describe('IntegrityService.scan', () => {
  it('detects an orphan record (DB row whose file is missing)', async () => {
    const m = repo.createMockup(row({ libraryPath: `${mockupsDir}/a/original.psd` }))
    const service = makeService({
      listFiles: async () => [],
      exists: async () => false
    })

    const report = await service.scan()

    expect(report.orphanRecords).toEqual([{ mockupId: m.id, libraryPath: `${mockupsDir}/a/original.psd` }])
    expect(report.orphanFiles).toEqual([])
  })

  it('detects an orphan file (on disk, no DB row)', async () => {
    const known = `${mockupsDir}/a/original.psd`
    const stray = `${mockupsDir}/x/stray.psd`
    repo.createMockup(row({ libraryPath: known }))

    const service = makeService({
      listFiles: async () => [known, stray],
      exists: async (p) => p === known
    })

    const report = await service.scan()

    expect(report.orphanFiles).toEqual([stray])
    expect(report.orphanRecords).toEqual([])
  })

  it('ignores generated cover/thumb files in the disk listing', async () => {
    const known = `${mockupsDir}/a/original.psd`
    repo.createMockup(row({ libraryPath: known }))

    const service = makeService({
      listFiles: async () => [
        known,
        `${mockupsDir}/a/cover.webp`,
        `${mockupsDir}/a/cover.png`,
        `${mockupsDir}/a/thumb.webp`
      ],
      exists: async () => true
    })

    const report = await service.scan()

    expect(report.orphanFiles).toEqual([])
    expect(report.orphanRecords).toEqual([])
  })

  it('reports nothing for a clean library', async () => {
    const a = `${mockupsDir}/a/original.psd`
    const b = `${mockupsDir}/b/original.psd`
    repo.createMockup(row({ libraryPath: a }))
    repo.createMockup(row({ libraryPath: b }))

    const service = makeService({
      listFiles: async () => [a, b, `${mockupsDir}/a/cover.webp`, `${mockupsDir}/b/thumb.webp`],
      exists: async () => true
    })

    const report = await service.scan()

    expect(report.orphanFiles).toEqual([])
    expect(report.orphanRecords).toEqual([])
  })

  it('deleteOrphanRecord removes the row and its FTS entry', async () => {
    const path = `${mockupsDir}/a/original.psd`
    const m = repo.createMockup(row({ libraryPath: path }))
    repo.upsertSearchIndex(m.id)
    const service = makeService({ listFiles: async () => [], exists: async () => false })

    // present before
    expect((await service.scan()).orphanRecords).toHaveLength(1)

    service.deleteOrphanRecord(m.id)

    expect(repo.getMockup(m.id)).toBeUndefined()
    const fts = sqlite.prepare(`SELECT rowid FROM mockups_fts WHERE rowid = ?`).all(m.id)
    expect(fts).toHaveLength(0)
    // no longer reported as an orphan record
    expect((await service.scan()).orphanRecords).toEqual([])
  })

  it('addOrphanFile registers an in-place needs_review mockup without re-copying', async () => {
    const orphan = `${mockupsDir}/found/original.psd`
    const service = makeService({
      listFiles: async () => [orphan],
      exists: async () => true,
      resolveCover: async () => ({
        source: 'embedded',
        coverPath: `${mockupsDir}/found/cover.webp`,
        thumbPath: `${mockupsDir}/found/thumb.webp`
      })
    })

    // before registration the file is an orphan
    expect((await service.scan()).orphanFiles).toEqual([orphan])

    const { mockupId } = await service.addOrphanFile(orphan)

    const created = repo.getMockup(mockupId)!
    expect(created.libraryPath).toBe(orphan) // NOT re-copied
    expect(created.reviewStatus).toBe('needs_review')
    expect(created.coverSource).toBe('embedded')
    const ctx = created.importContext as { batchId?: string; originalFilename?: string }
    expect(ctx.batchId).toBeTruthy()
    expect(ctx.originalFilename).toBe('original.psd')

    // follow-up scan no longer reports it as an orphan file
    expect((await service.scan()).orphanFiles).toEqual([])
  })

  it('addOrphanFile stores coverSource: none when no cover is resolved', async () => {
    const orphan = `${mockupsDir}/nocov/asset.psd`
    const service = makeService({
      listFiles: async () => [orphan],
      exists: async () => true,
      resolveCover: async () => ({ source: 'none' })
    })

    const { mockupId } = await service.addOrphanFile(orphan)

    const created = repo.getMockup(mockupId)!
    expect(created.coverSource).toBe('none')
    expect(created.reviewStatus).toBe('needs_review')
  })

  it('excludes soft-deleted records from the scan', async () => {
    const live = `${mockupsDir}/a/original.psd`
    const trashedPath = `${mockupsDir}/t/original.psd`
    repo.createMockup(row({ libraryPath: live }))
    const trashed = repo.createMockup(row({ libraryPath: trashedPath }))
    repo.updateMockup(trashed.id, { deletedAt: new Date().toISOString() })

    const service = makeService({
      listFiles: async () => [live],
      exists: async (p) => p === live
    })

    const report = await service.scan()

    // trashed record's missing file is not flagged (it's excluded from getAllLibraryPaths)
    expect(report.orphanRecords).toEqual([])
    expect(report.orphanFiles).toEqual([])
  })
})
