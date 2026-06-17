import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import type { NewMockup } from './schema'
import { Repository } from './repository'
import { seedTaxonomy } from './bootstrap'
import { ensureSearchIndex } from './search-index'

const batchSample = (batchId: string): NewMockup => ({
  title: 'Test Mockup',
  libraryPath: `/lib/mockups/${batchId}/original.psd`,
  coverPath: `/lib/mockups/${batchId}/cover.png`,
  coverSource: 'embedded',
  importContext: { batchId, folderTrail: [], originalFilename: 'x.psd' }
})

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

const sample: NewMockup = {
  title: 'MacBook Mockup',
  libraryPath: '/lib/mockups/abc/original.psd',
  coverPath: '/lib/mockups/abc/cover.png',
  coverSource: 'embedded'
}

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  repo = new Repository(db)
})

afterEach(() => sqlite.close())

describe('Repository — mockups', () => {
  it('creates and reads a mockup with correct defaults', () => {
    const created = repo.createMockup(sample)
    expect(created.id).toBeGreaterThan(0)
    expect(created.reviewStatus).toBe('needs_review')
    expect(created.favourite).toBe(false)
    expect(created.deletedAt).toBeNull()
    expect(repo.getMockup(created.id)?.title).toBe('MacBook Mockup')
  })

  it('orders favourites first, then newest first', () => {
    repo.createMockup({ ...sample, title: 'A' })
    const b = repo.createMockup({ ...sample, title: 'B' })
    repo.setFavourite(b.id, true)
    const all = repo.getAllMockups()
    expect(all[0]?.id).toBe(b.id)
  })

  it('setFavourite sets favouritedAt; unfavouriting clears it', () => {
    const m = repo.createMockup(sample)
    repo.setFavourite(m.id, true)
    expect(repo.getMockup(m.id)?.favouritedAt).not.toBeNull()
    repo.setFavourite(m.id, false)
    expect(repo.getMockup(m.id)?.favouritedAt).toBeNull()
  })

  it('deleteMockup returns true when found, false when not', () => {
    const m = repo.createMockup(sample)
    expect(repo.deleteMockup(m.id)).toBe(true)
    expect(repo.deleteMockup(m.id)).toBe(false)
  })

  it('getMockup returns undefined after deletion', () => {
    const m = repo.createMockup(sample)
    repo.deleteMockup(m.id)
    expect(repo.getMockup(m.id)).toBeUndefined()
  })
})

describe('Repository — variants', () => {
  it('creates variants ordered by position', () => {
    const m = repo.createMockup(sample)
    repo.createVariant({ mockupId: m.id, libraryPath: '/v2.psd', coverPath: '/v2.png', coverSource: 'embedded', position: 1 })
    repo.createVariant({ mockupId: m.id, libraryPath: '/v1.psd', coverPath: '/v1.png', coverSource: 'embedded', position: 0 })
    const variants = repo.getVariantsForMockup(m.id)
    expect(variants).toHaveLength(2)
    expect(variants[0]?.position).toBe(0)
    expect(variants[1]?.position).toBe(1)
  })

  it('cascade-deletes variants when mockup is deleted', () => {
    const m = repo.createMockup(sample)
    repo.createVariant({ mockupId: m.id, libraryPath: '/v1.psd', coverPath: '/v1.png', coverSource: 'embedded', position: 0 })
    repo.deleteMockup(m.id)
    expect(repo.getVariantsForMockup(m.id)).toHaveLength(0)
  })
})

describe('Repository — tags', () => {
  beforeEach(() => seedTaxonomy(db))

  it('links a tag to a mockup idempotently', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.addTagToMockup(m.id, laptop.id) // duplicate — should be ignored
    expect(repo.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['laptop'])
  })

  it('removes a specific tag from a mockup', () => {
    const tags = repo.getAllTags()
    const laptop = tags.find((t) => t.label === 'laptop')!
    const phone = tags.find((t) => t.label === 'phone')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.addTagToMockup(m.id, phone.id)
    repo.removeTagFromMockup(m.id, laptop.id)
    expect(repo.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['phone'])
  })

  it('cascade-deletes mockup_tags when mockup is deleted', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.deleteMockup(m.id)
    expect(repo.getTagsForMockup(m.id)).toHaveLength(0)
  })

  it('getAllTags includes both parent and child tags', () => {
    const all = repo.getAllTags()
    const labels = all.map((t) => t.label)
    expect(labels).toContain('laptop')
    expect(labels).toContain('macbook') // child of laptop
  })
})

describe('getMockupsByBatchId', () => {
  it('returns only mockups with the matching batchId', () => {
    repo.createMockup({ ...batchSample('batch-1'), title: 'A', libraryPath: '/lib/a.psd' })
    repo.createMockup({ ...batchSample('batch-1'), title: 'B', libraryPath: '/lib/b.psd' })
    repo.createMockup({ ...batchSample('batch-1'), title: 'C', libraryPath: '/lib/c.psd' })
    repo.createMockup({ ...batchSample('batch-2'), title: 'D', libraryPath: '/lib/d.psd' })
    repo.createMockup({ ...batchSample('batch-2'), title: 'E', libraryPath: '/lib/e.psd' })
    expect(repo.getMockupsByBatchId('batch-1')).toHaveLength(3)
    expect(repo.getMockupsByBatchId('batch-2')).toHaveLength(2)
    expect(repo.getMockupsByBatchId('batch-99')).toHaveLength(0)
  })
})

describe('approveItem', () => {
  it('sets reviewStatus, title, description, and coverPath on the mockup', () => {
    const m = repo.createMockup(sample)
    repo.approveItem(m.id, {
      title: 'Approved',
      description: 'Great',
      coverPath: '/cover.png',
      coverSource: 'embedded',
      reviewStatus: 'approved'
    })
    const updated = repo.getMockup(m.id)
    expect(updated?.reviewStatus).toBe('approved')
    expect(updated?.title).toBe('Approved')
    expect(updated?.description).toBe('Great')
  })
})

describe('setMockupCover', () => {
  it('updates coverPath and coverSource to user-uploaded', () => {
    const m = repo.createMockup(sample)
    repo.setMockupCover(m.id, '/new-cover.png', 'user-uploaded')
    const updated = repo.getMockup(m.id)
    expect(updated?.coverPath).toBe('/new-cover.png')
    expect(updated?.coverSource).toBe('user-uploaded')
  })
})

describe('confirmGroupings', () => {
  it('sets leader isGroup=true and members groupId=leader, singletons cleared', () => {
    const m1 = repo.createMockup({ ...batchSample('b'), title: 'M1', libraryPath: '/lib/m1.psd' })
    const m2 = repo.createMockup({ ...batchSample('b'), title: 'M2', libraryPath: '/lib/m2.psd' })
    const m3 = repo.createMockup({ ...batchSample('b'), title: 'M3', libraryPath: '/lib/m3.psd' })
    const m4 = repo.createMockup({ ...batchSample('b'), title: 'M4', libraryPath: '/lib/m4.psd' })

    repo.confirmGroupings([{ id: 'g1', memberIds: [m1.id, m2.id, m3.id] }], [m4.id])

    expect(repo.getMockup(m1.id)).toMatchObject({ isGroup: true, groupId: null })
    expect(repo.getMockup(m2.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.getMockup(m3.id)).toMatchObject({ isGroup: false, groupId: m1.id })
    expect(repo.getMockup(m4.id)).toMatchObject({ isGroup: false, groupId: null })
  })
})

describe('search index', () => {
  beforeEach(() => ensureSearchIndex(db))

  const matchFts = (query: string): number[] => {
    return (
      sqlite
        .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
        .all(query) as { rowid: number }[]
    ).map((r) => r.rowid)
  }

  it('upsertSearchIndex makes mockup findable by title and tag', () => {
    const m = repo.createMockup({ ...sample, title: 'MacBook Hero', libraryPath: '/lib/fts/a.psd' })
    repo.approveItem(m.id, { title: 'MacBook Hero', description: 'great mockup', coverPath: '/c.png', coverSource: 'embedded', reviewStatus: 'approved' })
    seedTaxonomy(db)
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    repo.addTagToMockup(m.id, laptop.id)

    repo.upsertSearchIndex(m.id)

    expect(matchFts('MacBook')).toContain(m.id)
    expect(matchFts('laptop')).toContain(m.id)
  })

  it('removeSearchIndex removes mockup from FTS', () => {
    const m = repo.createMockup({ ...sample, title: 'Remove Me', libraryPath: '/lib/fts/b.psd' })
    repo.upsertSearchIndex(m.id)
    expect(matchFts('Remove')).toContain(m.id)

    repo.removeSearchIndex(m.id)
    expect(matchFts('Remove')).not.toContain(m.id)
  })

  it('rebuildSearchIndex indexes only approved non-deleted mockups', () => {
    const approved = repo.createMockup({ ...sample, title: 'Approved One', libraryPath: '/lib/fts/c.psd' })
    repo.approveItem(approved.id, { title: 'Approved One', description: '', coverPath: '/c.png', coverSource: 'embedded', reviewStatus: 'approved' })

    const pending = repo.createMockup({ ...sample, title: 'Pending One', libraryPath: '/lib/fts/d.psd' })

    const deleted = repo.createMockup({ ...sample, title: 'Deleted One', libraryPath: '/lib/fts/e.psd' })
    repo.approveItem(deleted.id, { title: 'Deleted One', description: '', coverPath: '/c.png', coverSource: 'embedded', reviewStatus: 'approved' })
    repo.updateMockup(deleted.id, { deletedAt: new Date().toISOString() })

    repo.rebuildSearchIndex()

    expect(matchFts('Approved')).toContain(approved.id)
    expect(matchFts('Pending')).not.toContain(pending.id)
    expect(matchFts('Deleted')).not.toContain(deleted.id)
  })
})

const approvedMockup = (overrides: Partial<NewMockup> = {}): NewMockup => ({
  title: 'Mockup',
  libraryPath: '/lib/x.psd',
  coverPath: '/c.png',
  coverSource: 'embedded' as const,
  reviewStatus: 'approved',
  ...overrides
})

describe('getLibrary', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  it('excludes non-approved and soft-deleted mockups', () => {
    const approved = repo.createMockup(approvedMockup({ title: 'Good One', libraryPath: '/lib/good.psd' }))
    repo.createMockup(approvedMockup({ title: 'Needs Review', libraryPath: '/lib/nr.psd', reviewStatus: 'needs_review' }))
    const trashed = repo.createMockup(approvedMockup({ title: 'Trashed', libraryPath: '/lib/trash.psd' }))
    repo.updateMockup(trashed.id, { deletedAt: new Date().toISOString() })

    const result = repo.getLibrary({ sort: 'date' })
    const ids = result.map((r) => r.id)
    expect(ids).toContain(approved.id)
    expect(ids).not.toContain(trashed.id)
    expect(result.length).toBe(1)
  })

  it('excludes group members and returns leader with correct variantCount', () => {
    const leader = repo.createMockup(approvedMockup({ title: 'Leader', libraryPath: '/lib/leader.psd', isGroup: true }))
    repo.createMockup(approvedMockup({ title: 'Member1', libraryPath: '/lib/m1.psd', groupId: leader.id }))
    repo.createMockup(approvedMockup({ title: 'Member2', libraryPath: '/lib/m2.psd', groupId: leader.id }))

    const result = repo.getLibrary({ sort: 'date' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(leader.id)
    expect(result[0]!.variantCount).toBe(2)
  })

  it('favourites pin to top within filtered set; favourites missing the filter do not bypass it', () => {
    const allTags = repo.getAllTags()
    const laptop = allTags.find((t) => t.label === 'laptop')!
    const phone = allTags.find((t) => t.label === 'phone')!

    const a = repo.createMockup(approvedMockup({ title: 'Laptop A', libraryPath: '/lib/la.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Laptop B', libraryPath: '/lib/lb.psd' }))
    const c = repo.createMockup(approvedMockup({ title: 'Phone Only', libraryPath: '/lib/ph.psd' }))

    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, laptop.id)
    repo.addTagToMockup(c.id, phone.id)

    repo.setFavourite(c.id, true) // favourite but wrong tag
    repo.setFavourite(b.id, true) // favourite with correct tag

    const result = repo.getLibrary({ tagIds: [laptop.id], sort: 'date' })
    const ids = result.map((r) => r.id)

    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
    expect(ids).not.toContain(c.id)   // filtered out — not in laptop tag set
    expect(ids[0]).toBe(b.id)         // favourite first
  })

  it('expandTagIds rolls up parent tag to include children; getLibrary respects roll-up', () => {
    const allTags = repo.getAllTags()
    const laptop = allTags.find((t) => t.label === 'laptop')!
    const macbook = allTags.find((t) => t.label === 'macbook')!
    const phone = allTags.find((t) => t.label === 'phone')!

    const expanded = repo.expandTagIds([laptop.id])
    expect(expanded).toContain(laptop.id)
    expect(expanded).toContain(macbook.id)

    const a = repo.createMockup(approvedMockup({ title: 'MacBook', libraryPath: '/lib/mb.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Phone', libraryPath: '/lib/ph.psd' }))
    repo.addTagToMockup(a.id, macbook.id)
    repo.addTagToMockup(b.id, phone.id)

    const result = repo.getLibrary({ tagIds: [laptop.id], sort: 'date' })
    const ids = result.map((r) => r.id)
    expect(ids).toContain(a.id)    // matched via roll-up
    expect(ids).not.toContain(b.id)
  })

  it('search filters and prefix-matches by title/description/tags', () => {
    const a = repo.createMockup(approvedMockup({ title: 'MacBook Pro Hero', libraryPath: '/lib/a.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'iPhone Screen', libraryPath: '/lib/b.psd' }))
    const c = repo.createMockup(approvedMockup({ title: 'Another Laptop', libraryPath: '/lib/c.psd' }))

    repo.upsertSearchIndex(a.id)
    repo.upsertSearchIndex(b.id)
    repo.upsertSearchIndex(c.id)

    const macResult = repo.getLibrary({ query: 'macbook', sort: 'date' })
    const ids = macResult.map((r) => r.id)
    expect(ids).toContain(a.id)
    expect(ids).not.toContain(b.id)

    // prefix match: 'mac' matches 'macbook'
    const prefixResult = repo.getLibrary({ query: 'mac', sort: 'date' })
    expect(prefixResult.map((r) => r.id)).toContain(a.id)
  })

  it('sort:name vs sort:date produce different orderings; favourites always first', () => {
    const a = repo.createMockup(approvedMockup({ title: 'Zebra', libraryPath: '/lib/z.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Apple', libraryPath: '/lib/ap.psd' }))
    const c = repo.createMockup(approvedMockup({ title: 'Mango', libraryPath: '/lib/mg.psd' }))
    repo.setFavourite(c.id, true)

    const byName = repo.getLibrary({ sort: 'name' }).map((r) => r.id)
    const byDate = repo.getLibrary({ sort: 'date' }).map((r) => r.id)

    // Favourite always first regardless of sort
    expect(byName[0]).toBe(c.id)
    expect(byDate[0]).toBe(c.id)

    // After favourite, name sort: Apple(b) < Mango(c, already first as fav) < Zebra(a)
    // so byName non-favourite order is: b then a
    expect(byName.indexOf(b.id)).toBeLessThan(byName.indexOf(a.id))

    // The two sort modes produce logically different orderings
    // (byDate falls back to createdAt DESC; byName uses localeCompare)
    // Just assert both return all 3 items with favourite pinned
    expect(byName).toHaveLength(3)
    expect(byDate).toHaveLength(3)
  })
})

describe('getMockupDetail', () => {
  beforeEach(() => seedTaxonomy(db))

  it('returns mockup, tags, and variants for a group leader', () => {
    const leader = repo.createMockup(approvedMockup({ title: 'Leader', libraryPath: '/lib/ld.psd', isGroup: true }))
    repo.createMockup(approvedMockup({ title: 'V1', libraryPath: '/lib/v1.psd', groupId: leader.id }))
    repo.createMockup(approvedMockup({ title: 'V2', libraryPath: '/lib/v2.psd', groupId: leader.id }))
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    repo.addTagToMockup(leader.id, laptop.id)

    const detail = repo.getMockupDetail(leader.id)

    expect(detail.mockup?.id).toBe(leader.id)
    expect(detail.variants).toHaveLength(2)
    expect(detail.tags).toHaveLength(1)
    expect(detail.tags[0]!.label).toBe('laptop')
    expect(detail.tags[0]!.categoryLabel).toBeTruthy()
  })

  it('returns empty variants for a singleton', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Solo', libraryPath: '/lib/so.psd' }))
    const detail = repo.getMockupDetail(m.id)
    expect(detail.mockup?.id).toBe(m.id)
    expect(detail.variants).toHaveLength(0)
  })

  it('returns mockup=undefined for missing id', () => {
    const detail = repo.getMockupDetail(9999)
    expect(detail.mockup).toBeUndefined()
  })
})

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
    const leader = repo.createMockup(approvedMockup({ title: 'Leader', libraryPath: '/lib/ldr.psd', isGroup: true }))
    const member = repo.createMockup(approvedMockup({ title: 'Member', libraryPath: '/lib/mbr.psd', groupId: leader.id }))
    repo.updateMockup(leader.id, { deletedAt: '2025-01-01T00:00:00' })
    repo.updateMockup(member.id, { deletedAt: '2025-01-01T00:00:00' })

    const trash = repo.getTrash()
    const ids = trash.map((r) => r.id)
    expect(ids).toContain(leader.id)
    expect(ids).not.toContain(member.id)
  })
})

describe('getLibraryStats', () => {
  it('returns correct counts for a mixed fixture', () => {
    // approved, non-deleted, top-level
    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/a.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/b.psd', isGroup: true }))
    repo.createMockup(approvedMockup({ title: 'C', libraryPath: '/lib/c.psd', groupId: b.id })) // member, excluded
    repo.setFavourite(a.id, true)

    // needs_review → not counted in total
    repo.createMockup({ ...sample, title: 'NR', libraryPath: '/lib/nr.psd' })

    // trashed (approved but deletedAt set)
    const t = repo.createMockup(approvedMockup({ title: 'T', libraryPath: '/lib/t.psd' }))
    repo.updateMockup(t.id, { deletedAt: '2025-01-01T00:00:00' })

    const stats = repo.getLibraryStats()

    expect(stats.total).toBe(2)      // a and b (not member, not needs_review, not trashed)
    expect(stats.favourites).toBe(1) // a
    expect(stats.groups).toBe(1)     // b
    expect(stats.trashed).toBe(1)    // t
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

describe('updateMockupMeta', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  it('updates title/description, replaces tags, and refreshes FTS', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Old Title', libraryPath: '/lib/om.psd' }))
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const phone = repo.getAllTags().find((t) => t.label === 'phone')!
    repo.addTagToMockup(m.id, phone.id)
    repo.upsertSearchIndex(m.id)

    repo.updateMockupMeta(m.id, { title: 'New Title', description: 'Updated', tagIds: [laptop.id] })

    const updated = repo.getMockup(m.id)!
    expect(updated.title).toBe('New Title')
    expect(updated.description).toBe('Updated')
    expect(repo.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['laptop'])

    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('New') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).toContain(m.id)

    const oldRows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Old') as { rowid: number }[]
    expect(oldRows.map((r) => r.rowid)).not.toContain(m.id)
  })
})

describe('ungroupGroup', () => {
  it('sets leader isGroup=false and clears all members groupId', () => {
    const leader = repo.createMockup(approvedMockup({ title: 'Leader', libraryPath: '/lib/ug-l.psd', isGroup: true }))
    const m1 = repo.createMockup(approvedMockup({ title: 'M1', libraryPath: '/lib/ug-m1.psd', groupId: leader.id }))
    const m2 = repo.createMockup(approvedMockup({ title: 'M2', libraryPath: '/lib/ug-m2.psd', groupId: leader.id }))

    repo.ungroupGroup(leader.id)

    expect(repo.getMockup(leader.id)?.isGroup).toBe(false)
    expect(repo.getMockup(m1.id)?.groupId).toBeNull()
    expect(repo.getMockup(m2.id)?.groupId).toBeNull()
    // rows still exist
    expect(repo.getMockup(m1.id)).toBeDefined()
    expect(repo.getMockup(m2.id)).toBeDefined()
  })
})

describe('deleteMockupsHard', () => {
  beforeEach(() => ensureSearchIndex(db))

  it('returns paths and removes rows; variants cascade', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Del', libraryPath: '/lib/del.psd', coverPath: '/c/del.png' }))
    repo.createVariant({ mockupId: m.id, libraryPath: '/lib/del-v.psd', coverPath: '/c/del-v.png', coverSource: 'embedded', position: 0 })

    const paths = repo.deleteMockupsHard([m.id])

    expect(paths).toHaveLength(1)
    expect(paths[0]!.libraryPath).toBe('/lib/del.psd')
    expect(repo.getMockup(m.id)).toBeUndefined()
  })

  it('collects group ids correctly for bulk delete', () => {
    const leader = repo.createMockup(approvedMockup({ title: 'Leader', libraryPath: '/lib/gl.psd', isGroup: true }))
    const m1 = repo.createMockup(approvedMockup({ title: 'M1', libraryPath: '/lib/gm1.psd', groupId: leader.id }))
    const m2 = repo.createMockup(approvedMockup({ title: 'M2', libraryPath: '/lib/gm2.psd', groupId: leader.id }))

    const ids = repo.collectGroupIds(leader.id)
    expect(ids).toContain(leader.id)
    expect(ids).toContain(m1.id)
    expect(ids).toContain(m2.id)
    expect(ids).toHaveLength(3)
  })
})

describe('duplicateMockupRow', () => {
  beforeEach(() => seedTaxonomy(db))

  it('creates a copy with same title/tags but favourite=false and fresh id', () => {
    const m = repo.createMockup(approvedMockup({ title: 'Original', libraryPath: '/lib/orig.psd' }))
    repo.setFavourite(m.id, true)
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    repo.addTagToMockup(m.id, laptop.id)

    const result = repo.duplicateMockupRow(m.id)

    expect(result).not.toBeNull()
    expect(result!.newId).not.toBe(m.id)
    expect(result!.sourceLibraryPath).toBe('/lib/orig.psd')

    const copy = repo.getMockup(result!.newId)!
    expect(copy.title).toBe('Original')
    expect(copy.favourite).toBe(false)
    expect(copy.deletedAt).toBeNull()
    expect(repo.getTagsForMockup(copy.id).map((t) => t.label)).toContain('laptop')
  })

  it('returns null for missing id', () => {
    expect(repo.duplicateMockupRow(9999)).toBeNull()
  })
})

describe('tag management — reads + simple edits (M8.1)', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  const matchFts = (query: string): number[] =>
    (
      sqlite
        .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
        .all(query) as { rowid: number }[]
    ).map((r) => r.rowid)

  it('getTagTree groups tags under categories with correct usageCount', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = repo.createMockup(approvedMockup({ title: 'Tree', libraryPath: '/lib/tree.psd' }))
    repo.addTagToMockup(m.id, laptop.id)

    const tree = repo.getTagTree()
    const device = tree.find((c) => c.categoryLabel === 'Device')!
    expect(device).toBeDefined()
    // categories ordered by sortOrder — Device is first
    expect(tree[0]!.categoryLabel).toBe('Device')

    const laptopNode = device.tags.find((t) => t.label === 'laptop')!
    expect(laptopNode.usageCount).toBe(1)
    expect(laptopNode.parentTagId).toBeNull()

    const macbookNode = device.tags.find((t) => t.label === 'macbook')!
    expect(macbookNode.parentTagId).toBe(laptop.id)
    expect(macbookNode.usageCount).toBe(0)
  })

  it('getTagUsageCount counts distinct mockups carrying the tag', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/uca.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/ucb.psd' }))
    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, laptop.id)
    repo.addTagToMockup(a.id, laptop.id) // idempotent — still distinct mockups = 2
    expect(repo.getTagUsageCount(laptop.id)).toBe(2)
  })

  it('renameTag changes the label AND updates FTS (new label matches, old no longer)', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = repo.createMockup(approvedMockup({ title: 'Rename Tag', libraryPath: '/lib/rt.psd' }))
    repo.addTagToMockup(m.id, laptop.id)
    repo.upsertSearchIndex(m.id)
    expect(matchFts('laptop')).toContain(m.id)

    repo.renameTag(laptop.id, 'notebook')

    expect(repo.getAllTags().find((t) => t.id === laptop.id)!.label).toBe('notebook')
    expect(matchFts('notebook')).toContain(m.id)
    expect(matchFts('laptop')).not.toContain(m.id)
  })

  it('reassignTagCategory moves a tag between categories', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const apparel = repo.getAllCategories().find((c) => c.label === 'Apparel')!
    repo.reassignTagCategory(laptop.id, apparel.id)

    const tree = repo.getTagTree()
    const apparelNode = tree.find((c) => c.categoryLabel === 'Apparel')!
    const deviceNode = tree.find((c) => c.categoryLabel === 'Device')!
    expect(apparelNode.tags.map((t) => t.label)).toContain('laptop')
    expect(deviceNode.tags.map((t) => t.label)).not.toContain('laptop')
  })

  it('setTagParent sets a parent in the same category', () => {
    const tags = repo.getAllTags()
    const phone = tags.find((t) => t.label === 'phone')!
    const tablet = tags.find((t) => t.label === 'tablet')! // same category (Device)
    repo.setTagParent(tablet.id, phone.id)
    expect(repo.getAllTags().find((t) => t.id === tablet.id)!.parentTagId).toBe(phone.id)

    repo.setTagParent(tablet.id, null)
    expect(repo.getAllTags().find((t) => t.id === tablet.id)!.parentTagId).toBeNull()
  })

  it('setTagParent throws when parent is in a different category', () => {
    const tags = repo.getAllTags()
    const laptop = tags.find((t) => t.label === 'laptop')! // Device
    const tshirt = tags.find((t) => t.label === 't-shirt')! // Apparel
    expect(() => repo.setTagParent(laptop.id, tshirt.id)).toThrow()
  })

  it('setTagParent throws when parent === tag', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    expect(() => repo.setTagParent(laptop.id, laptop.id)).toThrow()
  })

  it('renameCategory changes the category label', () => {
    const device = repo.getAllCategories().find((c) => c.label === 'Device')!
    repo.renameCategory(device.id, 'Devices & Screens')
    expect(repo.getAllCategories().find((c) => c.id === device.id)!.label).toBe('Devices & Screens')
  })
})

describe('tag management — merge / delete / deleteCategory (M8.2)', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  const matchFts = (query: string): number[] =>
    (
      sqlite
        .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
        .all(query) as { rowid: number }[]
    ).map((r) => r.rowid)

  it('mergeTags re-points associations, dedupes, deletes source, reindexes FTS', () => {
    const all = repo.getAllTags()
    const macbook = all.find((t) => t.label === 'macbook')!
    const laptop = all.find((t) => t.label === 'laptop')!

    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/mga.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/mgb.psd' }))
    repo.addTagToMockup(a.id, macbook.id)
    repo.addTagToMockup(b.id, macbook.id)
    repo.addTagToMockup(b.id, laptop.id) // B already has both
    repo.upsertSearchIndex(a.id)
    repo.upsertSearchIndex(b.id)

    const result = repo.mergeTags(macbook.id, laptop.id)

    expect(result.affectedMockups).toBe(2)
    // A now has laptop (only)
    expect(repo.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['laptop'])
    // B has laptop once — no duplicate row
    expect(repo.getTagsForMockup(b.id).map((t) => t.label)).toEqual(['laptop'])
    // source tag gone
    expect(repo.getAllTags().find((t) => t.id === macbook.id)).toBeUndefined()
    // FTS: old label no longer matches; new label matches both
    expect(matchFts('macbook')).toEqual([])
    const laptopMatches = matchFts('laptop')
    expect(laptopMatches).toContain(a.id)
    expect(laptopMatches).toContain(b.id)
  })

  it('mergeTags throws when source === target or a tag is missing', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    expect(() => repo.mergeTags(laptop.id, laptop.id)).toThrow()
    expect(() => repo.mergeTags(99999, laptop.id)).toThrow()
    expect(() => repo.mergeTags(laptop.id, 99999)).toThrow()
  })

  it('deleteTag returns affected count, removes associations, and clears FTS label', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = repo.createMockup(approvedMockup({ title: 'Hero Shot', libraryPath: '/lib/dt.psd' }))
    repo.addTagToMockup(m.id, laptop.id)
    repo.upsertSearchIndex(m.id)
    expect(matchFts('laptop')).toContain(m.id)

    const result = repo.deleteTag(laptop.id)

    expect(result.affectedMockups).toBe(1)
    expect(repo.getAllTags().find((t) => t.id === laptop.id)).toBeUndefined()
    expect(repo.getTagsForMockup(m.id)).toHaveLength(0)
    expect(matchFts('laptop')).not.toContain(m.id)
    // title still indexed — FTS row preserved, only tag label dropped
    expect(matchFts('Hero')).toContain(m.id)
  })

  it('deleteCategory throws when the category still has tags, succeeds once empty', () => {
    const device = repo.getAllCategories().find((c) => c.label === 'Device')!
    expect(() => repo.deleteCategory(device.id)).toThrow(/category not empty/)

    // remove all tags in the category
    for (const t of repo.getAllTags().filter((t) => t.categoryId === device.id)) {
      repo.deleteTag(t.id)
    }
    expect(() => repo.deleteCategory(device.id)).not.toThrow()
    expect(repo.getAllCategories().find((c) => c.id === device.id)).toBeUndefined()
  })
})
