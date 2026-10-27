import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Mockup } from '../schema'
import type { Repository } from '../repository'
import { ensureSearchIndex } from '../search-index'
import { approvedMockup, createTestDb } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
})

afterEach(() => sqlite.close())

describe('getTrash', () => {
  it('returns only soft-deleted top-level items, newest-trashed first', () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'Trashed A', libraryPath: '/lib/ta.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'Trashed B', libraryPath: '/lib/tb.psd' }))
    const live = repo.mockups.createMockup(approvedMockup({ title: 'Live', libraryPath: '/lib/lv.psd' }))

    repo.mockups.updateMockup(a.id, { deletedAt: '2025-01-01T10:00:00' })
    repo.mockups.updateMockup(b.id, { deletedAt: '2025-06-01T10:00:00' }) // newer

    const trash = repo.trash.getTrash()
    const ids = trash.map((r) => r.id)

    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(live.id)
    // newest deletedAt first
    expect(ids[0]).toBe(b.id)
  })

  it('excludes group members', () => {
    const leader = repo.mockups.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ldr.psd', isGroup: true })
    )
    const member = repo.mockups.createMockup(
      approvedMockup({ title: 'Member', libraryPath: '/lib/mbr.psd', groupId: leader.id })
    )
    repo.mockups.updateMockup(leader.id, { deletedAt: '2025-01-01T00:00:00' })
    repo.mockups.updateMockup(member.id, { deletedAt: '2025-01-01T00:00:00' })

    const trash = repo.trash.getTrash()
    const ids = trash.map((r) => r.id)
    expect(ids).toContain(leader.id)
    expect(ids).not.toContain(member.id)
  })
})

describe('getTrashEntries', () => {
  it('lists each pile or single once, newest first, with the ids it covers', () => {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Top', libraryPath: '/lib/t.psd', isGroup: true })
    )
    const side = repo.mockups.createMockup(
      approvedMockup({ title: 'Side', libraryPath: '/lib/s.psd', groupId: top.id })
    )
    const single = repo.mockups.createMockup(approvedMockup({ title: 'Single', libraryPath: '/lib/g.psd' }))
    repo.mockups.updateMockup(top.id, { deletedAt: '2026-01-01T10:00:00.000Z' })
    repo.mockups.updateMockup(single.id, { deletedAt: '2026-02-01T10:00:00.000Z' })

    const entries = repo.trash.getTrashEntries()

    expect(entries.map((e) => e.row.id)).toEqual([single.id, top.id])
    expect(entries[0]).toMatchObject({ trashedAt: '2026-02-01T10:00:00.000Z', ids: [single.id] })
    expect(entries[1]).toMatchObject({ ids: [top.id, side.id] })
    expect(entries[1]!.row).toMatchObject({ pile: { memberCount: 2 } })
  })
})

describe('moveToTrash / restore', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('moveToTrash sets deletedAt and removes from FTS', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Trash Me', libraryPath: '/lib/tm.psd' }))
    repo.search.upsertSearchIndex(m.id)

    repo.trash.moveToTrash(m.id)

    expect(repo.mockups.getMockup(m.id)?.deletedAt).not.toBeNull()
    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Trash') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).not.toContain(m.id)
  })

  it('restore clears deletedAt and re-indexes approved mockup', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Restore Me', libraryPath: '/lib/rm.psd' }))
    repo.trash.moveToTrash(m.id)

    repo.trash.restore(m.id)

    expect(repo.mockups.getMockup(m.id)?.deletedAt).toBeNull()
    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Restore') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).toContain(m.id)
  })
})

describe('moveManyToTrash / restoreMany', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('moves several mockups together with one timestamp and skips ids that do not exist', () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/ma.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/mb.psd' }))
    const keep = repo.mockups.createMockup(approvedMockup({ title: 'Keep', libraryPath: '/lib/mk.psd' }))

    const moved = repo.trash.moveManyToTrash([a.id, b.id, a.id, 9999])

    expect(moved).toBe(2)
    expect(repo.mockups.getMockup(a.id)?.deletedAt).not.toBeNull()
    expect(repo.mockups.getMockup(a.id)?.deletedAt).toBe(repo.mockups.getMockup(b.id)?.deletedAt)
    expect(repo.mockups.getMockup(keep.id)?.deletedAt).toBeNull()
    expect(repo.trash.getTrash().map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('brings several back and re-indexes them', () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'Alpha', libraryPath: '/lib/ra.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'Bravo', libraryPath: '/lib/rb.psd' }))
    repo.trash.moveManyToTrash([a.id, b.id])

    const restored = repo.trash.restoreMany([a.id, b.id, 9999])

    expect(restored).toBe(2)
    expect(repo.trash.getTrash()).toHaveLength(0)
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([a.id, b.id])
    expect(repo.library.getLibrary({ query: 'Bravo', sort: 'date' }).map((r) => r.id)).toEqual([b.id])
  })

  it('trashes and restores a pile as one', () => {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Top', libraryPath: '/lib/pt.psd', isGroup: true })
    )
    repo.mockups.createMockup(approvedMockup({ title: 'V', libraryPath: '/lib/pv.psd', groupId: top.id }))

    repo.trash.moveManyToTrash([top.id])
    expect(repo.library.getLibrary({ sort: 'date' })).toHaveLength(0)
    expect(repo.trash.getTrash().map((r) => r.id)).toEqual([top.id])

    repo.trash.restoreMany([top.id])
    expect(repo.library.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([top.id])
  })
})

describe('a move that fails part-way changes nothing', () => {
  beforeEach(() => ensureSearchIndex(db))

  /** Two indexed mockups; SQLite refuses any change to the second. */
  const twoWithTheSecondStuck = (when: string) => {
    const [a, b] = ['First', 'Second'].map((title) => {
      const m = repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/stuck-${title}.psd` }))
      repo.search.upsertSearchIndex(m.id)
      return m
    }) as [Mockup, Mockup]
    sqlite.exec(`CREATE TRIGGER stuck ${when} ON mockups WHEN OLD.id = ${b.id}
      BEGIN SELECT RAISE(ABORT, 'stuck'); END`)
    return [a, b] as const
  }

  it('moveManyToTrash', () => {
    const [a, b] = twoWithTheSecondStuck('BEFORE UPDATE OF deleted_at')
    expect(() => repo.trash.moveManyToTrash([a.id, b.id])).toThrow(/stuck/)
    expect(repo.mockups.getMockup(a.id)?.deletedAt).toBeNull()
    expect(repo.search.isIndexed(a.id)).toBe(true)
  })

  it('restoreMany', () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'First', libraryPath: '/lib/r1.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'Second', libraryPath: '/lib/r2.psd' }))
    repo.trash.moveManyToTrash([a.id, b.id])
    sqlite.exec(`CREATE TRIGGER stuck BEFORE UPDATE OF deleted_at ON mockups WHEN OLD.id = ${b.id}
      BEGIN SELECT RAISE(ABORT, 'stuck'); END`)

    expect(() => repo.trash.restoreMany([a.id, b.id])).toThrow(/stuck/)
    expect(repo.mockups.getMockup(a.id)?.deletedAt).not.toBeNull()
    expect(repo.search.isIndexed(a.id)).toBe(false)
  })

  it('deleteMockupsHard', () => {
    const [a, b] = twoWithTheSecondStuck('BEFORE DELETE')
    expect(() => repo.trash.deleteMockupsHard([a.id, b.id])).toThrow(/stuck/)
    expect(repo.mockups.getMockup(a.id)).toBeDefined()
    expect(repo.search.isIndexed(a.id)).toBe(true)
    expect(repo.search.isIndexed(b.id)).toBe(true)
  })
})

describe('moveManyToTrash: a mockup inside a pile', () => {
  beforeEach(() => ensureSearchIndex(db))

  const pileOf = (count: number) => {
    const top = repo.mockups.createMockup(
      approvedMockup({ title: 'Clay mug', libraryPath: '/lib/p0.psd', isGroup: true, variation: 'front' })
    )
    const members = Array.from({ length: count - 1 }, (_, i) =>
      repo.mockups.createMockup(
        approvedMockup({
          title: 'Clay mug',
          libraryPath: `/lib/p${i + 1}.psd`,
          groupId: top.id,
          variation: `side ${i + 1}`
        })
      )
    )
    return { top, members }
  }
  /** Rows the Trash, the pile page and Empty Trash can't see: in Trash and still in a pile. */
  const stranded = () =>
    sqlite.prepare('SELECT id FROM mockups WHERE deleted_at IS NOT NULL AND group_id IS NOT NULL').all()

  it('takes it out of the pile first, so the pile counts one fewer and Trash lists it on its own', () => {
    const { top, members } = pileOf(3)
    const [gone, stays] = members as [Mockup, Mockup]

    expect(repo.trash.moveManyToTrash([gone.id])).toBe(1)

    expect(stranded()).toEqual([])
    expect(repo.piles.getMockupsByGroupId(top.id).map((m) => m.id)).toEqual([stays.id])
    expect(repo.library.getLibrary({ sort: 'date' })[0]).toMatchObject({
      id: top.id,
      pile: { memberCount: 2 }
    })
    expect(repo.trash.getTrashEntries()).toMatchObject([{ row: { id: gone.id, pile: null }, ids: [gone.id] }])
  })

  it('keeps its full title once it is on its own', () => {
    const { members } = pileOf(3)
    const gone = members[0]!

    repo.trash.moveManyToTrash([gone.id])

    expect(repo.mockups.getMockup(gone.id)).toMatchObject({
      title: 'Clay mug · side 1',
      variation: null,
      variationSource: null
    })
  })

  it('a pile left with one mockup stops being a pile', () => {
    const { top, members } = pileOf(2)

    repo.trash.moveManyToTrash([members[0]!.id])

    expect(stranded()).toEqual([])
    expect(repo.mockups.getMockup(top.id)).toMatchObject({ isGroup: false, groupId: null, title: 'Clay mug · front' })
    expect(repo.library.getLibrary({ sort: 'date' })).toMatchObject([{ id: top.id, pile: null }])
  })

  it('Restore brings it back on its own and leaves the pile as it is', () => {
    const { top, members } = pileOf(3)
    const gone = members[0]!
    repo.trash.moveManyToTrash([gone.id])

    expect(repo.trash.restoreMany([gone.id])).toBe(1)

    expect(repo.mockups.getMockup(gone.id)).toMatchObject({ deletedAt: null, isGroup: false, groupId: null })
    expect(repo.piles.getMockupsByGroupId(top.id).map((m) => m.id)).toEqual([members[1]!.id])
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id).sort()).toEqual(
      [top.id, gone.id].sort()
    )
  })

  it('a mockup whose pile goes to Trash in the same move goes with its pile', () => {
    const { top, members } = pileOf(3)

    expect(repo.trash.moveManyToTrash([members[0]!.id, top.id])).toBe(1)

    expect(stranded()).toEqual([])
    expect(repo.trash.getTrashEntries()).toMatchObject([
      { row: { id: top.id }, ids: [top.id, ...members.map((m) => m.id)] }
    ])
  })
})

describe('deleteMockupsHard', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('returns paths and removes rows; variants cascade', () => {
    const m = repo.mockups.createMockup(
      approvedMockup({ title: 'Del', libraryPath: '/lib/del.psd', coverPath: '/c/del.png' })
    )
    repo.mockups.createVariant({
      mockupId: m.id,
      libraryPath: '/lib/del-v.psd',
      coverPath: '/c/del-v.png',
      coverSource: 'embedded',
      position: 0
    })

    const paths = repo.trash.deleteMockupsHard([m.id])

    expect(paths).toHaveLength(1)
    expect(paths[0]!.libraryPath).toBe('/lib/del.psd')
    expect(repo.mockups.getMockup(m.id)).toBeUndefined()
  })

  it('collects group ids correctly for bulk delete', () => {
    const leader = repo.mockups.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/gl.psd', isGroup: true })
    )
    const m1 = repo.mockups.createMockup(
      approvedMockup({ title: 'M1', libraryPath: '/lib/gm1.psd', groupId: leader.id })
    )
    const m2 = repo.mockups.createMockup(
      approvedMockup({ title: 'M2', libraryPath: '/lib/gm2.psd', groupId: leader.id })
    )

    const ids = repo.piles.collectGroupIds(leader.id)
    expect(ids).toContain(leader.id)
    expect(ids).toContain(m1.id)
    expect(ids).toContain(m2.id)
    expect(ids).toHaveLength(3)
  })
})
