import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from './schema'
import type { Repository } from './repository'
import { ensureSearchIndex } from './search-index'
import { createTestDb, sample } from './repositories/__tests__/setup'
import { refreshSearchIndex } from './search-index-refresh'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
  ensureSearchIndex(db)
})

afterEach(() => sqlite.close())

const indexed = (): number[] =>
  (sqlite.prepare('SELECT rowid FROM mockups_fts ORDER BY rowid').all() as { rowid: number }[]).map(
    (r) => r.rowid
  )

function stashed(title: string): number {
  return repo.mockups.createMockup({
    ...sample,
    title,
    libraryPath: `/lib/fts/${title}.psd`,
    stage: 'stashed'
  }).id
}

describe('refreshSearchIndex', () => {
  it('rebuilds a library that has never been stamped', () => {
    const id = stashed('Hero')
    sqlite.prepare('DELETE FROM mockups_fts').run()

    expect(refreshSearchIndex(sqlite, () => repo.search.rebuildSearchIndex())).toBe(true)
    expect(indexed()).toEqual([id])
  })

  it('skips the rebuild on the next launch while the stamp matches', () => {
    stashed('Hero')
    refreshSearchIndex(sqlite, () => repo.search.rebuildSearchIndex())

    const rebuild = vi.fn()
    expect(refreshSearchIndex(sqlite, rebuild)).toBe(false)
    expect(rebuild).not.toHaveBeenCalled()
  })

  it('rebuilds once after a new migration', () => {
    refreshSearchIndex(sqlite, () => repo.search.rebuildSearchIndex())
    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run('next', Date.now())

    const rebuild = vi.fn()
    expect(refreshSearchIndex(sqlite, rebuild)).toBe(true)
    expect(refreshSearchIndex(sqlite, rebuild)).toBe(false)
    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('runs the whole rebuild in one transaction', () => {
    stashed('Hero')
    let inTransaction = false
    refreshSearchIndex(sqlite, () => {
      inTransaction = sqlite.inTransaction
      repo.search.rebuildSearchIndex()
    })
    expect(inTransaction).toBe(true)
  })

  it('a rebuild that fails part-way leaves the index as it was and tries again next launch', () => {
    const id = stashed('Hero')
    repo.search.upsertSearchIndex(id)

    expect(() =>
      refreshSearchIndex(sqlite, () => {
        sqlite.prepare('DELETE FROM mockups_fts').run()
        throw new Error('disk full')
      })
    ).toThrow('disk full')
    expect(indexed()).toEqual([id])

    const rebuild = vi.fn()
    expect(refreshSearchIndex(sqlite, rebuild)).toBe(true)
    expect(rebuild).toHaveBeenCalledTimes(1)
  })
})
