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
  stage: 'stashed',
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
  exists: vi.fn<(p: string) => Promise<boolean>>().mockResolvedValue(true)
})

describe('openExternal', () => {
  it('calls openPath with the mockup libraryPath and returns {opened:true}', async () => {
    const m = repo.mockups.createMockup(approvedRow({ title: 'Open Me', libraryPath: '/lib/open.psd' }))
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.openExternal(m.id)

    expect(result).toEqual({ opened: true })
    expect(deps.openPath).toHaveBeenCalledWith('/lib/open.psd')
  })

  it('says it failed, and does not call openPath, for a mockup that does not exist', async () => {
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.openExternal(9999)

    expect(result).toEqual({ opened: false, reason: 'failed' })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('says it failed when the PSD is no longer on disk', async () => {
    const m = repo.mockups.createMockup(approvedRow({ title: 'Gone', libraryPath: '/lib/gone.psd' }))
    const deps = makeDeps()
    deps.exists.mockResolvedValueOnce(false)
    const svc = new LibraryService(repo, '/library', deps)

    expect(await svc.openExternal(m.id)).toEqual({ opened: false, reason: 'failed' })
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('says there is no app when the system has nothing to open it with', async () => {
    const m = repo.mockups.createMockup(approvedRow({ title: 'NoApp', libraryPath: '/lib/noapp.psd' }))
    const deps = makeDeps()
    deps.openPath.mockResolvedValueOnce('Failed to open path /lib/noapp.psd')
    const svc = new LibraryService(repo, '/library', deps)

    const result = await svc.openExternal(m.id)

    // The system's message holds a path, so only the reason goes back.
    expect(result).toEqual({ opened: false, reason: 'no-app' })
  })

  it('says it failed when opening throws', async () => {
    const m = repo.mockups.createMockup(approvedRow({ title: 'Boom', libraryPath: '/lib/boom.psd' }))
    const deps = makeDeps()
    deps.openPath.mockRejectedValueOnce(new Error('boom'))
    const svc = new LibraryService(repo, '/library', deps)

    expect(await svc.openExternal(m.id)).toEqual({ opened: false, reason: 'failed' })
  })

  it('opens a pile through its top mockup', async () => {
    const top = repo.mockups.createMockup(
      approvedRow({ title: 'Top', libraryPath: '/lib/top.psd', isGroup: true })
    )
    repo.mockups.createMockup(approvedRow({ title: 'Side', libraryPath: '/lib/side.psd', groupId: top.id }))
    const deps = makeDeps()
    const svc = new LibraryService(repo, '/library', deps)

    expect(await svc.openExternal(top.id)).toEqual({ opened: true })
    expect(deps.openPath).toHaveBeenCalledWith('/lib/top.psd')
  })
})
