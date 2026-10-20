import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
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
    const a = repo.createMockup(approvedMockup({ title: 'Trashed A', libraryPath: '/lib/ta.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Trashed B', libraryPath: '/lib/tb.psd' }))
    const live = repo.createMockup(approvedMockup({ title: 'Live', libraryPath: '/lib/lv.psd' }))

    repo.updateMockup(a.id, { deletedAt: '2025-01-01T10:00:00' })
    repo.updateMockup(b.id, { deletedAt: '2025-06-01T10:00:00' }) // newer

    const trash = repo.getTrash()
    const ids = trash.map((r) => r.id)

    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(live.id)
    // newest deletedAt first
    expect(ids[0]).toBe(b.id)
  })

  it('excludes group members', () => {
    const leader = repo.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ldr.psd', isGroup: true })
    )
    const member = repo.createMockup(
      approvedMockup({ title: 'Member', libraryPath: '/lib/mbr.psd', groupId: leader.id })
    )
    repo.updateMockup(leader.id, { deletedAt: '2025-01-01T00:00:00' })
    repo.updateMockup(member.id, { deletedAt: '2025-01-01T00:00:00' })

    const trash = repo.getTrash()
    const ids = trash.map((r) => r.id)
    expect(ids).toContain(leader.id)
    expect(ids).not.toContain(member.id)
  })
})

describe('moveToTrash / restore', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('moveToTrash sets deletedAt and removes from FTS', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Trash Me', libraryPath: '/lib/tm.psd' }))
    repo.upsertSearchIndex(m.id)

    repo.moveToTrash(m.id)

    expect(repo.getMockup(m.id)?.deletedAt).not.toBeNull()
    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Trash') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).not.toContain(m.id)
  })

  it('restore clears deletedAt and re-indexes approved mockup', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Restore Me', libraryPath: '/lib/rm.psd' }))
    repo.moveToTrash(m.id)

    repo.restore(m.id)

    expect(repo.getMockup(m.id)?.deletedAt).toBeNull()
    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Restore') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).toContain(m.id)
  })
})

describe('moveManyToTrash / restoreMany', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('moves several mockups together with one timestamp and skips ids that do not exist', () => {
    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/ma.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/mb.psd' }))
    const keep = repo.createMockup(approvedMockup({ title: 'Keep', libraryPath: '/lib/mk.psd' }))

    const moved = repo.moveManyToTrash([a.id, b.id, a.id, 9999])

    expect(moved).toBe(2)
    expect(repo.getMockup(a.id)?.deletedAt).not.toBeNull()
    expect(repo.getMockup(a.id)?.deletedAt).toBe(repo.getMockup(b.id)?.deletedAt)
    expect(repo.getMockup(keep.id)?.deletedAt).toBeNull()
    expect(repo.getTrash().map((r) => r.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('brings several back and re-indexes them', () => {
    const a = repo.createMockup(approvedMockup({ title: 'Alpha', libraryPath: '/lib/ra.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Bravo', libraryPath: '/lib/rb.psd' }))
    repo.moveManyToTrash([a.id, b.id])

    const restored = repo.restoreMany([a.id, b.id, 9999])

    expect(restored).toBe(2)
    expect(repo.getTrash()).toHaveLength(0)
    expect(repo.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([a.id, b.id])
    expect(repo.getLibrary({ query: 'Bravo', sort: 'date' }).map((r) => r.id)).toEqual([b.id])
  })

  it('trashes and restores a pile as one', () => {
    const top = repo.createMockup(
      approvedMockup({ title: 'Top', libraryPath: '/lib/pt.psd', isGroup: true })
    )
    repo.createMockup(approvedMockup({ title: 'V', libraryPath: '/lib/pv.psd', groupId: top.id }))

    repo.moveManyToTrash([top.id])
    expect(repo.getLibrary({ sort: 'date' })).toHaveLength(0)
    expect(repo.getTrash().map((r) => r.id)).toEqual([top.id])

    repo.restoreMany([top.id])
    expect(repo.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([top.id])
  })
})

describe('deleteMockupsHard', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('returns paths and removes rows; variants cascade', () => {
    const m = repo.createMockup(
      approvedMockup({ title: 'Del', libraryPath: '/lib/del.psd', coverPath: '/c/del.png' })
    )
    repo.createVariant({
      mockupId: m.id,
      libraryPath: '/lib/del-v.psd',
      coverPath: '/c/del-v.png',
      coverSource: 'embedded',
      position: 0
    })

    const paths = repo.deleteMockupsHard([m.id])

    expect(paths).toHaveLength(1)
    expect(paths[0]!.libraryPath).toBe('/lib/del.psd')
    expect(repo.getMockup(m.id)).toBeUndefined()
  })

  it('collects group ids correctly for bulk delete', () => {
    const leader = repo.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/gl.psd', isGroup: true })
    )
    const m1 = repo.createMockup(
      approvedMockup({ title: 'M1', libraryPath: '/lib/gm1.psd', groupId: leader.id })
    )
    const m2 = repo.createMockup(
      approvedMockup({ title: 'M2', libraryPath: '/lib/gm2.psd', groupId: leader.id })
    )

    const ids = repo.collectGroupIds(leader.id)
    expect(ids).toContain(leader.id)
    expect(ids).toContain(m1.id)
    expect(ids).toContain(m2.id)
    expect(ids).toHaveLength(3)
  })
})
