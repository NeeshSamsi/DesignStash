import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.addTagToMockup(m.id, laptop.id) // duplicate — should be ignored
    expect(repo.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['Laptop'])
  })

  it('removes a specific tag from a mockup', () => {
    const tags = repo.getAllTags()
    const laptop = tags.find((t) => t.label === 'Laptop')!
    const phone = tags.find((t) => t.label === 'Phone')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.addTagToMockup(m.id, phone.id)
    repo.removeTagFromMockup(m.id, laptop.id)
    expect(repo.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['Phone'])
  })

  it('cascade-deletes mockup_tags when mockup is deleted', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.createMockup(sample)
    repo.addTagToMockup(m.id, laptop.id)
    repo.deleteMockup(m.id)
    expect(repo.getTagsForMockup(m.id)).toHaveLength(0)
  })

  it('getAllTags returns every seeded tag as a flat list', () => {
    const all = repo.getAllTags()
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
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const m = repo.createMockup(approvedMockup({ title: 'Tree', libraryPath: '/lib/tree.psd' }))
    repo.addTagToMockup(m.id, laptop.id)

    const tree = repo.getTagTree()
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
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/uca.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/ucb.psd' }))
    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, laptop.id)
    repo.addTagToMockup(a.id, laptop.id) // idempotent — still distinct mockups = 2
    expect(repo.getTagUsageCount(laptop.id)).toBe(2)
  })

  it('renameTag changes the label AND updates FTS (new label matches, old no longer)', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
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
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const apparel = repo.getAllCategories().find((c) => c.label === 'Apparel')!
    repo.reassignTagCategory(laptop.id, apparel.id)

    const tree = repo.getTagTree()
    const apparelNode = tree.find((c) => c.categoryLabel === 'Apparel')!
    const deviceNode = tree.find((c) => c.categoryLabel === 'Device')!
    expect(apparelNode.tags.map((t) => t.label)).toContain('Laptop')
    expect(deviceNode.tags.map((t) => t.label)).not.toContain('Laptop')
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
      sqlite.prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`).all(query) as {
        rowid: number
      }[]
    ).map((r) => r.rowid)

  it('mergeTags re-points associations, dedupes, deletes source, reindexes FTS', () => {
    const all = repo.getAllTags()
    const macbook = all.find((t) => t.label === 'MacBook')!
    const laptop = all.find((t) => t.label === 'Laptop')!

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
    expect(repo.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['Laptop'])
    // B has laptop once — no duplicate row
    expect(repo.getTagsForMockup(b.id).map((t) => t.label)).toEqual(['Laptop'])
    // source tag gone
    expect(repo.getAllTags().find((t) => t.id === macbook.id)).toBeUndefined()
    // FTS: old label no longer matches; new label matches both
    expect(matchFts('macbook')).toEqual([])
    const laptopMatches = matchFts('laptop')
    expect(laptopMatches).toContain(a.id)
    expect(laptopMatches).toContain(b.id)
  })

  it('mergeTags throws when source === target or a tag is missing', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    expect(() => repo.mergeTags(laptop.id, laptop.id)).toThrow()
    expect(() => repo.mergeTags(99999, laptop.id)).toThrow()
    expect(() => repo.mergeTags(laptop.id, 99999)).toThrow()
  })

  it('deleteTag returns affected count, removes associations, and clears FTS label', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
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

  it('deleteTag returns a snapshot that restoreTag uses to bring the tag back on every mockup', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const a = repo.createMockup(approvedMockup({ title: 'Undo A', libraryPath: '/lib/ua.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Undo B', libraryPath: '/lib/ub.psd' }))
    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, laptop.id)
    repo.upsertSearchIndex(a.id)
    repo.upsertSearchIndex(b.id)

    const { snapshot } = repo.deleteTag(laptop.id)
    expect(snapshot.tag).toMatchObject({
      id: laptop.id,
      label: 'Laptop',
      categoryId: laptop.categoryId
    })
    expect(snapshot.mockupIds.sort()).toEqual([a.id, b.id].sort())

    const restored = repo.restoreTag(snapshot)

    expect(restored).toEqual({ tagId: laptop.id, restoredMockups: 2 })
    expect(repo.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['Laptop'])
    expect(repo.getTagsForMockup(b.id).map((t) => t.label)).toEqual(['Laptop'])
    expect(matchFts('laptop').sort()).toEqual([a.id, b.id].sort())
  })

  it('restoreTag relinks to a same-named tag created since the delete, skipping gone mockups', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const a = repo.createMockup(approvedMockup({ title: 'Kept', libraryPath: '/lib/rk.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Gone', libraryPath: '/lib/rg.psd' }))
    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, laptop.id)

    const { snapshot } = repo.deleteTag(laptop.id)
    const again = repo.createTag({ label: 'Laptop', categoryId: laptop.categoryId })
    repo.deleteMockup(b.id)

    expect(repo.restoreTag(snapshot)).toEqual({ tagId: again.id, restoredMockups: 1 })
    expect(repo.getTagsForMockup(a.id).map((t) => t.id)).toEqual([again.id])
  })

  it('previewMergeTags counts the mockups that would move, without changing anything', () => {
    const all = repo.getAllTags()
    const macbook = all.find((t) => t.label === 'MacBook')!
    const laptop = all.find((t) => t.label === 'Laptop')!
    const a = repo.createMockup(approvedMockup({ title: 'P1', libraryPath: '/lib/p1.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'P2', libraryPath: '/lib/p2.psd' }))
    repo.addTagToMockup(a.id, macbook.id)
    repo.addTagToMockup(b.id, macbook.id)

    expect(repo.previewMergeTags(macbook.id, laptop.id)).toEqual({ affectedMockups: 2 })
    expect(repo.getTagsForMockup(a.id).map((t) => t.label)).toEqual(['MacBook'])
    expect(() => repo.previewMergeTags(laptop.id, laptop.id)).toThrow()
    expect(() => repo.previewMergeTags(99999, laptop.id)).toThrow()
  })

  it('deleteCategory with moveTagsTo moves its tags (merging same names) and keeps mockups tagged', () => {
    const cats = repo.getAllCategories()
    const angle = cats.find((c) => c.label === 'Angle')!
    const environment = cats.find((c) => c.label === 'Environment')!
    const front = repo.getAllTags().find((t) => t.label === 'Front')!
    const clash = repo.createTag({ label: 'Side', categoryId: environment.id })
    const sideInAngle = repo
      .getAllTags()
      .find((t) => t.label === 'Side' && t.categoryId === angle.id)!
    const m = repo.createMockup(approvedMockup({ title: 'Moved', libraryPath: '/lib/mv.psd' }))
    repo.addTagToMockup(m.id, front.id)
    repo.addTagToMockup(m.id, sideInAngle.id)

    const result = repo.deleteCategory(angle.id, environment.id)

    expect(result.movedTags).toBe(4)
    expect(result.snapshot).toMatchObject({ id: angle.id, label: 'Angle' })
    expect(repo.getAllCategories().find((c) => c.id === angle.id)).toBeUndefined()
    const labels = repo
      .getTagsForMockup(m.id)
      .map((t) => `${t.categoryId}:${t.label}`)
      .sort()
    expect(labels).toEqual([`${environment.id}:Front`, `${environment.id}:Side`])
    expect(repo.getTagsForMockup(m.id).map((t) => t.id)).toContain(clash.id)
  })

  it('deleteCategory rejects moving tags into itself or a missing category', () => {
    const angle = repo.getAllCategories().find((c) => c.label === 'Angle')!
    expect(() => repo.deleteCategory(angle.id, angle.id)).toThrow()
    expect(() => repo.deleteCategory(angle.id, 99999)).toThrow()
  })

  it('restoreCategory brings back an empty category that was deleted', () => {
    const empty = repo.createCategory({ label: 'Mood' })
    const { snapshot } = repo.deleteCategory(empty.id)

    expect(repo.restoreCategory(snapshot)).toEqual({ categoryId: empty.id })
    expect(repo.getAllCategories().find((c) => c.id === empty.id)?.label).toBe('Mood')
  })

  it('findTagsByLabel matches across categories, ignoring case and spaces, with use counts', () => {
    const style = repo.getAllCategories().find((c) => c.label === 'Style')!
    const minimal = repo.getAllTags().find((t) => t.label === 'Minimal')!
    const m = repo.createMockup(approvedMockup({ title: 'Clean', libraryPath: '/lib/fd.psd' }))
    repo.addTagToMockup(m.id, minimal.id)

    expect(repo.findTagsByLabel('  Minimal ')).toEqual([
      {
        tagId: minimal.id,
        label: 'Minimal',
        categoryId: style.id,
        categoryLabel: 'Style',
        usageCount: 1
      }
    ])
    expect(repo.findTagsByLabel('nothing-like-this')).toEqual([])
  })
})

describe('Repository — getApprovalTagsByIds', () => {
  beforeEach(() => seedTaxonomy(db))

  it('returns [] for an empty id list', () => {
    expect(repo.getApprovalTagsByIds([])).toEqual([])
  })

  it('returns ApprovalTags with correct label and categoryLabel for seeded ids', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const phone = repo.getAllTags().find((t) => t.label === 'Phone')!
    const result = repo.getApprovalTagsByIds([laptop.id, phone.id])
    expect(result).toHaveLength(2)
    expect(result[0]?.label).toBe('Laptop')
    expect(result[0]?.categoryLabel).toBe('Device')
    expect(result[1]?.label).toBe('Phone')
    expect(result[1]?.categoryLabel).toBe('Device')
  })

  it('preserves input order and de-dupes a repeated id', () => {
    const phone = repo.getAllTags().find((t) => t.label === 'Phone')!
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const result = repo.getApprovalTagsByIds([phone.id, laptop.id, phone.id])
    expect(result).toHaveLength(2)
    expect(result[0]?.label).toBe('Phone')
    expect(result[1]?.label).toBe('Laptop')
  })

  it('silently skips a non-existent id', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    const result = repo.getApprovalTagsByIds([laptop.id, 999999])
    expect(result).toHaveLength(1)
    expect(result[0]?.label).toBe('Laptop')
  })
})
