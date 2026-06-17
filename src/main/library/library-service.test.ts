import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../db/schema'
import type { NewMockup } from '../db/schema'
import { Repository } from '../db/repository'
import { seedTaxonomy } from '../db/bootstrap'
import { ensureSearchIndex } from '../db/search-index'
import { LibraryService } from './library-service'

const approvedRow = (overrides: Partial<NewMockup> = {}): NewMockup => ({
  title: 'Test',
  libraryPath: '/lib/mockups/x/original.psd',
  coverPath: '/lib/mockups/x/cover.png',
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
  repo = new Repository(db)
  seedTaxonomy(db)
  ensureSearchIndex(db)
})

afterEach(() => sqlite.close())

const makeDeps = () => ({
  openPath: vi.fn<(p: string) => Promise<string>>().mockResolvedValue(''),
  rm: vi.fn<(p: string) => Promise<void>>().mockImplementation(async () => {}),
  copyFile: vi.fn<(src: string, dest: string) => Promise<void>>().mockImplementation(async () => {}),
  mkdir: vi.fn<(p: string) => Promise<void>>().mockImplementation(async () => {})
})

describe('openExternal', () => {
  it('calls openPath with the mockup libraryPath and returns {opened:true}', async () => {
    const m = repo.createMockup(approvedRow({ title: 'Open Me', libraryPath: '/lib/open.psd' }))
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.openExternal(m.id)

    expect(result).toEqual({ opened: true })
    expect(deps.openPath).toHaveBeenCalledWith('/lib/open.psd')
  })

  it('returns {opened:false} and does not call openPath for missing mockup', async () => {
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.openExternal(9999)

    expect(result).toEqual({ opened: false })
    expect(deps.openPath).not.toHaveBeenCalled()
  })
})

describe('deletePermanently', () => {
  it('calls rm for both library file and cover, and removes the row', async () => {
    const m = repo.createMockup(approvedRow({
      title: 'Del',
      libraryPath: '/lib/del/original.psd',
      coverPath: '/lib/del/cover.png'
    }))
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    await svc.deletePermanently(m.id)

    expect(deps.rm).toHaveBeenCalledWith('/lib/del/original.psd')
    expect(deps.rm).toHaveBeenCalledWith('/lib/del/cover.png')
    expect(repo.getMockup(m.id)).toBeUndefined()
  })
})

describe('deleteGroup', () => {
  it('removes leader + all members, calls rm per file, returns removed count', async () => {
    const leader = repo.createMockup(approvedRow({ title: 'Leader', libraryPath: '/lib/l/original.psd', coverPath: '/lib/l/cover.png', isGroup: true }))
    repo.createMockup(approvedRow({ title: 'M1', libraryPath: '/lib/m1/original.psd', coverPath: '/lib/m1/cover.png', groupId: leader.id }))
    repo.createMockup(approvedRow({ title: 'M2', libraryPath: '/lib/m2/original.psd', coverPath: '/lib/m2/cover.png', groupId: leader.id }))
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.deleteGroup(leader.id)

    expect(result).toEqual({ deleted: true, removed: 3 })
    // 3 mockups × 2 paths each = 6 rm calls
    expect(deps.rm).toHaveBeenCalledTimes(6)
    expect(repo.getMockup(leader.id)).toBeUndefined()
  })
})

describe('duplicate', () => {
  it('creates a new row, copies files into a new dir, and makes the duplicate searchable', async () => {
    const m = repo.createMockup(approvedRow({
      title: 'Source',
      libraryPath: '/lib/src/original.psd',
      coverPath: '/lib/src/cover.png'
    }))
    repo.upsertSearchIndex(m.id)

    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.duplicate(m.id)

    expect(result.newMockupId).not.toBe(m.id)
    expect(deps.mkdir).toHaveBeenCalledTimes(1)
    expect(deps.copyFile).toHaveBeenCalledTimes(2) // lib file + cover
    expect(deps.copyFile).toHaveBeenCalledWith('/lib/src/original.psd', expect.stringContaining('original.psd'))
    expect(deps.copyFile).toHaveBeenCalledWith('/lib/src/cover.png', expect.stringContaining('cover.png'))

    const copy = repo.getMockup(result.newMockupId)!
    expect(copy.title).toBe('Source')
    expect(copy.favourite).toBe(false)
    // copy should be in the FTS index
    const ftsRows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Source') as { rowid: number }[]
    expect(ftsRows.map((r) => r.rowid)).toContain(result.newMockupId)
  })
})
