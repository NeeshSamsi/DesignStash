import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from './schema'
import type { Repository } from './repository'
import { ensureSearchIndex } from './search-index'
import { approvedMockup, createTestDb } from './repositories/__tests__/setup'
import { PileTitles } from '../library/pile-titles'
import { SEARCH_INDEX_VERSION, runLaunchUpkeep, type UpkeepSteps } from './launch-upkeep'

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

/** A stashed mockup that came in as `fileName`. */
const make = (fileName: string): number =>
  repo.mockups.createMockup(
    approvedMockup({
      title: fileName.replace(/\.psd$/, ''),
      libraryPath: `/lib/${fileName}`,
      importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName }
    })
  ).id

/** The real launch work, the way launch-steps runs it. */
const real = (): UpkeepSteps => ({
  settlePileTitles: () => new PileTitles(repo).settleAll(),
  rebuildSearchIndex: () => repo.search.rebuildSearchIndex()
})

const spies = () => ({ settlePileTitles: vi.fn(), rebuildSearchIndex: vi.fn() })

describe('runLaunchUpkeep', () => {
  it('settles piles from before base titles and rebuilds the index on a library never stamped', () => {
    const [top, member] = [make('tote-a.psd'), make('tote-b.psd')]
    repo.piles.createPile([top, member], top)
    repo.mockups.updateMockup(member, { title: 'Blue tote' })
    sqlite.prepare('DELETE FROM mockups_fts').run()

    expect(runLaunchUpkeep(sqlite, real())).toBe(true)

    expect(repo.mockups.getMockup(member)!.title).toBe('tote-a')
    expect(indexed()).toEqual([top, member])
  })

  it('does neither on the next launch while the stamp matches', () => {
    make('poster.psd')
    runLaunchUpkeep(sqlite, real())

    const steps = spies()
    expect(runLaunchUpkeep(sqlite, steps)).toBe(false)
    expect(steps.settlePileTitles).not.toHaveBeenCalled()
    expect(steps.rebuildSearchIndex).not.toHaveBeenCalled()
  })

  it('runs both once after a new migration', () => {
    runLaunchUpkeep(sqlite, real())
    sqlite
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run('next', Date.now())

    const steps = spies()
    expect(runLaunchUpkeep(sqlite, steps)).toBe(true)
    expect(runLaunchUpkeep(sqlite, steps)).toBe(false)
    expect(steps.settlePileTitles).toHaveBeenCalledTimes(1)
    expect(steps.rebuildSearchIndex).toHaveBeenCalledTimes(1)
  })

  it('settles the piles first, then rebuilds, all in one transaction', () => {
    const calls: string[] = []
    runLaunchUpkeep(sqlite, {
      settlePileTitles: () => calls.push(`settle ${sqlite.inTransaction}`),
      rebuildSearchIndex: () => calls.push(`rebuild ${sqlite.inTransaction}`)
    })
    expect(calls).toEqual(['settle true', 'rebuild true'])
  })

  it('a rebuild that fails part-way leaves the index as it was and tries again next launch', () => {
    const id = make('poster.psd')
    repo.search.upsertSearchIndex(id)

    expect(() =>
      runLaunchUpkeep(sqlite, {
        settlePileTitles: () => {},
        rebuildSearchIndex: () => {
          sqlite.prepare('DELETE FROM mockups_fts').run()
          throw new Error('disk full')
        }
      })
    ).toThrow('disk full')
    expect(indexed()).toEqual([id])

    const steps = spies()
    expect(runLaunchUpkeep(sqlite, steps)).toBe(true)
    expect(steps.rebuildSearchIndex).toHaveBeenCalledTimes(1)
  })

  it('a settle that fails is reported, the index still rebuilds, and both run again next launch', () => {
    const onError = vi.fn()
    const rebuild = vi.fn()
    const failing = new Error('pile 12 unreadable')

    runLaunchUpkeep(
      sqlite,
      {
        settlePileTitles: () => {
          throw failing
        },
        rebuildSearchIndex: rebuild
      },
      onError
    )

    expect(onError).toHaveBeenCalledWith(failing)
    expect(rebuild).toHaveBeenCalledTimes(1)
    const steps = spies()
    expect(runLaunchUpkeep(sqlite, steps)).toBe(true)
    expect(steps.settlePileTitles).toHaveBeenCalledTimes(1)
  })
})

describe('SEARCH_INDEX_VERSION', () => {
  it('is past the version whose name words kept lookalike letters, so those libraries rebuild once (H-4)', () => {
    expect(SEARCH_INDEX_VERSION).toBeGreaterThanOrEqual(2)
  })
})
