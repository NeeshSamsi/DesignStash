import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { approvedMockup, createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
})

afterEach(() => sqlite.close())

describe('Repository — tags', () => {
  beforeEach(() => seedTaxonomy(db))

  it('links a tag to a mockup idempotently', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.mockups.createMockup(sample)
    repo.mockups.addTagToMockup(m.id, laptop.id)
    repo.mockups.addTagToMockup(m.id, laptop.id) // duplicate — should be ignored
    expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['Laptop'])
  })

  it('removes a specific tag from a mockup', () => {
    const tags = repo.tags.getAllTags()
    const laptop = tags.find((t) => t.label === 'Laptop')!
    const phone = tags.find((t) => t.label === 'Phone')!
    const m = repo.mockups.createMockup(sample)
    repo.mockups.addTagToMockup(m.id, laptop.id)
    repo.mockups.addTagToMockup(m.id, phone.id)
    repo.mockups.removeTagFromMockup(m.id, laptop.id)
    expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['Phone'])
  })

  it('cascade-deletes mockup_tags when mockup is deleted', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.mockups.createMockup(sample)
    repo.mockups.addTagToMockup(m.id, laptop.id)
    repo.mockups.deleteMockup(m.id)
    expect(repo.mockups.getTagsForMockup(m.id)).toHaveLength(0)
  })

  it('getAllTags returns every seeded tag as a flat list', () => {
    const all = repo.tags.getAllTags()
    const labels = all.map((t) => t.label)
    expect(labels).toContain('Laptop')
    expect(labels).toContain('MacBook')
    expect(Object.keys(all[0]!).sort()).toEqual([
      'categoryId',
      'createdBy',
      'id',
      'isCanonical',
      'label'
    ])
  })
})

describe('tag management — reads + simple edits (M8.1)', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  const matchFts = (query: string): number[] =>
    (
      sqlite.prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`).all(query) as {
        rowid: number
      }[]
    ).map((r) => r.rowid)

  it('getTagTree groups tags under categories with correct usageCount', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Tree', libraryPath: '/lib/tree.psd' }))
    repo.mockups.addTagToMockup(m.id, laptop.id)

    const tree = repo.tags.getTagTree()
    const device = tree.find((c) => c.categoryLabel === 'Device')!
    expect(device).toBeDefined()
    // categories ordered by sortOrder — Device is first
    expect(tree[0]!.categoryLabel).toBe('Device')

    const laptopNode = device.tags.find((t) => t.label === 'Laptop')!
    expect(laptopNode.usageCount).toBe(1)
    expect(Object.keys(laptopNode).sort()).toEqual(['label', 'tagId', 'usageCount'])

    const macbookNode = device.tags.find((t) => t.label === 'MacBook')!
    expect(macbookNode.usageCount).toBe(0)

    // The category carries its own tag count for the "3 tags" header.
    expect(device.tagCount).toBe(device.tags.length)
    expect(device.tagCount).toBe(16)
  })

  it('getTagUsageCount counts distinct mockups carrying the tag', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const a = repo.mockups.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/uca.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/ucb.psd' }))
    repo.mockups.addTagToMockup(a.id, laptop.id)
    repo.mockups.addTagToMockup(b.id, laptop.id)
    repo.mockups.addTagToMockup(a.id, laptop.id) // idempotent — still distinct mockups = 2
    expect(repo.tags.getTagUsageCount(laptop.id)).toBe(2)
  })

  it('renameTag changes the label AND updates FTS (new label matches, old no longer)', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Rename Tag', libraryPath: '/lib/rt.psd' }))
    repo.mockups.addTagToMockup(m.id, laptop.id)
    repo.search.upsertSearchIndex(m.id)
    expect(matchFts('laptop')).toContain(m.id)

    repo.tags.renameTag(laptop.id, 'notebook')

    expect(repo.tags.getAllTags().find((t) => t.id === laptop.id)!.label).toBe('notebook')
    expect(matchFts('notebook')).toContain(m.id)
    expect(matchFts('laptop')).not.toContain(m.id)
  })

  it('reassignTagCategory moves a tag between categories', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const apparel = repo.tags.getAllCategories().find((c) => c.label === 'Apparel')!
    repo.tags.reassignTagCategory(laptop.id, apparel.id)

    const tree = repo.tags.getTagTree()
    const apparelNode = tree.find((c) => c.categoryLabel === 'Apparel')!
    const deviceNode = tree.find((c) => c.categoryLabel === 'Device')!
    expect(apparelNode.tags.map((t) => t.label)).toContain('Laptop')
    expect(deviceNode.tags.map((t) => t.label)).not.toContain('Laptop')
  })

  it('renameCategory changes the category label', () => {
    const device = repo.tags.getAllCategories().find((c) => c.label === 'Device')!
    repo.tags.renameCategory(device.id, 'Devices & Screens')
    expect(repo.tags.getAllCategories().find((c) => c.id === device.id)!.label).toBe('Devices & Screens')
  })
})

describe('tag management — merge / delete / deleteCategory (M8.2)', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  const matchFts = (query: string): number[] =>
    (
      sqlite.prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`).all(query) as {
        rowid: number
      }[]
    ).map((r) => r.rowid)

  it('mergeTags re-points associations, dedupes, deletes source, reindexes FTS', () => {
    const all = repo.tags.getAllTags()
    const macbook = all.find((t) => t.label === 'MacBook')!
    const laptop = all.find((t) => t.label === 'Laptop')!

    const a = repo.mockups.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/mga.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/mgb.psd' }))
    repo.mockups.addTagToMockup(a.id, macbook.id)
    repo.mockups.addTagToMockup(b.id, macbook.id)
    repo.mockups.addTagToMockup(b.id, laptop.id) // B already has both
    repo.search.upsertSearchIndex(a.id)
    repo.search.upsertSearchIndex(b.id)

    const result = repo.tags.mergeTags(macbook.id, laptop.id)

    expect(result.affectedMockups).toBe(2)
    // A now has laptop (only)
    expect(repo.mockups.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['Laptop'])
    // B has laptop once — no duplicate row
    expect(repo.mockups.getTagsForMockup(b.id).map((t) => t.label)).toEqual(['Laptop'])
    // source tag gone
    expect(repo.tags.getAllTags().find((t) => t.id === macbook.id)).toBeUndefined()
    // FTS: old label no longer matches; new label matches both
    expect(matchFts('macbook')).toEqual([])
    const laptopMatches = matchFts('laptop')
    expect(laptopMatches).toContain(a.id)
    expect(laptopMatches).toContain(b.id)
  })

  it('mergeTags throws when source === target or a tag is missing', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    expect(() => repo.tags.mergeTags(laptop.id, laptop.id)).toThrow()
    expect(() => repo.tags.mergeTags(99999, laptop.id)).toThrow()
    expect(() => repo.tags.mergeTags(laptop.id, 99999)).toThrow()
  })

  it('deleteTag returns affected count, removes associations, and clears FTS label', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Hero Shot', libraryPath: '/lib/dt.psd' }))
    repo.mockups.addTagToMockup(m.id, laptop.id)
    repo.search.upsertSearchIndex(m.id)
    expect(matchFts('laptop')).toContain(m.id)

    const result = repo.tags.deleteTag(laptop.id)

    expect(result.affectedMockups).toBe(1)
    expect(repo.tags.getAllTags().find((t) => t.id === laptop.id)).toBeUndefined()
    expect(repo.mockups.getTagsForMockup(m.id)).toHaveLength(0)
    expect(matchFts('laptop')).not.toContain(m.id)
    // title still indexed — FTS row preserved, only tag label dropped
    expect(matchFts('Hero')).toContain(m.id)
  })

  it('deleteCategory throws when the category still has tags, succeeds once empty', () => {
    const device = repo.tags.getAllCategories().find((c) => c.label === 'Device')!
    expect(() => repo.tags.deleteCategory(device.id)).toThrow(/category not empty/)

    // remove all tags in the category
    for (const t of repo.tags.getAllTags().filter((t) => t.categoryId === device.id)) {
      repo.tags.deleteTag(t.id)
    }
    expect(() => repo.tags.deleteCategory(device.id)).not.toThrow()
    expect(repo.tags.getAllCategories().find((c) => c.id === device.id)).toBeUndefined()
  })

  it('previewMergeTags counts the mockups that would move, without changing anything', () => {
    const all = repo.tags.getAllTags()
    const macbook = all.find((t) => t.label === 'MacBook')!
    const laptop = all.find((t) => t.label === 'Laptop')!
    const a = repo.mockups.createMockup(approvedMockup({ title: 'P1', libraryPath: '/lib/p1.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'P2', libraryPath: '/lib/p2.psd' }))
    repo.mockups.addTagToMockup(a.id, macbook.id)
    repo.mockups.addTagToMockup(b.id, macbook.id)

    expect(repo.tags.previewMergeTags(macbook.id, laptop.id)).toEqual({ affectedMockups: 2 })
    expect(repo.mockups.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['MacBook'])
    expect(() => repo.tags.previewMergeTags(laptop.id, laptop.id)).toThrow()
    expect(() => repo.tags.previewMergeTags(99999, laptop.id)).toThrow()
  })

  it('deleteCategory with moveTagsTo moves its tags (merging same names) and keeps mockups tagged', () => {
    const cats = repo.tags.getAllCategories()
    const angle = cats.find((c) => c.label === 'Angle')!
    const environment = cats.find((c) => c.label === 'Environment')!
    const front = repo.tags.getAllTags().find((t) => t.label === 'Front')!
    const clash = repo.tags.createTag({ label: 'Side', categoryId: environment.id })
    const sideInAngle = repo
      .tags.getAllTags()
      .find((t) => t.label === 'Side' && t.categoryId === angle.id)!
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Moved', libraryPath: '/lib/mv.psd' }))
    repo.mockups.addTagToMockup(m.id, front.id)
    repo.mockups.addTagToMockup(m.id, sideInAngle.id)

    const result = repo.tags.deleteCategory(angle.id, environment.id)

    expect(result.movedTags).toBe(4)
    expect(repo.tags.getAllCategories().find((c) => c.id === angle.id)).toBeUndefined()
    const labels = repo
      .mockups.getTagsForMockup(m.id)
      .map((t) => `${t.categoryId}:${t.label}`)
      .sort()
    expect(labels).toEqual([`${environment.id}:Front`, `${environment.id}:Side`])
    expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.id)).toContain(clash.id)
  })

  it('deleteCategory leaves everything where it was when a move fails midway', () => {
    const cats = repo.tags.getAllCategories()
    const angle = cats.find((c) => c.label === 'Angle')!
    const environment = cats.find((c) => c.label === 'Environment')!
    const inAngle = repo.tags.getAllTags().filter((t) => t.categoryId === angle.id)
    expect(inAngle.length).toBeGreaterThan(2)
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Kept', libraryPath: '/lib/kept.psd' }))
    for (const t of inAngle) repo.mockups.addTagToMockup(m.id, t.id)
    // The last tag cannot move, so the ones before it must not stay moved.
    const stuck = inAngle.reduce((a, b) => (b.id > a.id ? b : a))
    sqlite.exec(`CREATE TRIGGER stuck_tag BEFORE UPDATE OF category_id ON tags
      WHEN OLD.id = ${stuck.id} BEGIN SELECT RAISE(ABORT, 'stuck'); END`)
    const before = repo.tags.getAllTags().map((t) => `${t.id}:${t.categoryId}`)

    expect(() => repo.tags.deleteCategory(angle.id, environment.id)).toThrow(/stuck/)

    expect(repo.tags.getAllTags().map((t) => `${t.id}:${t.categoryId}`)).toEqual(before)
    expect(repo.tags.getAllCategories().find((c) => c.id === angle.id)).toBeDefined()
    expect(repo.mockups.getTagsForMockup(m.id)).toHaveLength(inAngle.length)
  })

  describe('a write that fails part-way changes nothing', () => {
    /** Search can't take the change: every write that keeps it in step fails. */
    const searchFails = () =>
      vi.spyOn(repo.search, 'upsertSearchIndex').mockImplementation(() => {
        throw new Error('search is stuck')
      })
    const tagged = (label: string) => {
      const tag = repo.tags.getAllTags().find((t) => t.label === label)!
      const m = repo.mockups.createMockup(approvedMockup({ title: `Has ${label}`, libraryPath: `/lib/f-${label}.psd` }))
      repo.mockups.addTagToMockup(m.id, tag.id)
      repo.search.upsertSearchIndex(m.id)
      return { tag, m }
    }

    it('renameTag', () => {
      const { tag } = tagged('Laptop')
      searchFails()
      expect(() => repo.tags.renameTag(tag.id, 'Notebook')).toThrow('search is stuck')
      expect(repo.tags.getAllTags().find((t) => t.id === tag.id)?.label).toBe('Laptop')
    })

    it('deleteTag', () => {
      const { tag, m } = tagged('Laptop')
      searchFails()
      expect(() => repo.tags.deleteTag(tag.id)).toThrow('search is stuck')
      expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.id)).toEqual([tag.id])
      expect(matchFts('laptop')).toEqual([m.id])
    })

    it('mergeTags', () => {
      const { tag: macbook, m } = tagged('MacBook')
      const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
      searchFails()
      expect(() => repo.tags.mergeTags(macbook.id, laptop.id)).toThrow('search is stuck')
      expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.id)).toEqual([macbook.id])
    })

    it('deleteCategory with its tags moving into a same-named one', () => {
      const environment = repo.tags.getAllCategories().find((c) => c.label === 'Environment')!
      const angle = repo.tags.getAllCategories().find((c) => c.label === 'Angle')!
      repo.tags.createTag({ label: 'Side', categoryId: environment.id })
      const { tag: side, m } = tagged('Side')
      expect(side.categoryId).toBe(angle.id)
      searchFails()
      expect(() => repo.tags.deleteCategory(angle.id, environment.id)).toThrow('search is stuck')
      expect(repo.tags.getAllCategories().find((c) => c.id === angle.id)).toBeDefined()
      expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.id)).toEqual([side.id])
    })
  })

  it('deleteCategory rejects moving tags into itself or a missing category', () => {
    const angle = repo.tags.getAllCategories().find((c) => c.label === 'Angle')!
    expect(() => repo.tags.deleteCategory(angle.id, angle.id)).toThrow()
    expect(() => repo.tags.deleteCategory(angle.id, 99999)).toThrow()
  })

  it('findTagsByLabel matches across categories, ignoring case and spaces, with use counts', () => {
    const style = repo.tags.getAllCategories().find((c) => c.label === 'Style')!
    const minimal = repo.tags.getAllTags().find((t) => t.label === 'Minimal')!
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Clean', libraryPath: '/lib/fd.psd' }))
    repo.mockups.addTagToMockup(m.id, minimal.id)

    expect(repo.tags.findTagsByLabel('  Minimal ')).toEqual([
      {
        tagId: minimal.id,
        label: 'Minimal',
        categoryId: style.id,
        categoryLabel: 'Style',
        usageCount: 1
      }
    ])
    expect(repo.tags.findTagsByLabel('nothing-like-this')).toEqual([])
  })
})

describe('Repository — getApprovalTagsByIds', () => {
  beforeEach(() => seedTaxonomy(db))

  it('returns [] for an empty id list', () => {
    expect(repo.tags.getApprovalTagsByIds([])).toEqual([])
  })

  it('returns ApprovalTags with correct label and categoryLabel for seeded ids', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const phone = repo.tags.getAllTags().find((t) => t.label === 'Phone')!
    const result = repo.tags.getApprovalTagsByIds([laptop.id, phone.id])
    expect(result).toHaveLength(2)
    expect(result[0]?.label).toBe('Laptop')
    expect(result[0]?.categoryLabel).toBe('Device')
    expect(result[1]?.label).toBe('Phone')
    expect(result[1]?.categoryLabel).toBe('Device')
  })

  it('preserves input order and de-dupes a repeated id', () => {
    const phone = repo.tags.getAllTags().find((t) => t.label === 'Phone')!
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const result = repo.tags.getApprovalTagsByIds([phone.id, laptop.id, phone.id])
    expect(result).toHaveLength(2)
    expect(result[0]?.label).toBe('Phone')
    expect(result[1]?.label).toBe('Laptop')
  })

  it('silently skips a non-existent id', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const result = repo.tags.getApprovalTagsByIds([laptop.id, 999999])
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe('Laptop')
  })
})
