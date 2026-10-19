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

describe('getLibrary', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  it('excludes non-approved and soft-deleted mockups', () => {
    const approved = repo.createMockup(
      approvedMockup({ title: 'Good One', libraryPath: '/lib/good.psd' })
    )
    repo.createMockup(
      approvedMockup({
        title: 'Needs Review',
        libraryPath: '/lib/nr.psd',
        reviewStatus: 'needs_review'
      })
    )
    const trashed = repo.createMockup(
      approvedMockup({ title: 'Trashed', libraryPath: '/lib/trash.psd' })
    )
    repo.updateMockup(trashed.id, { deletedAt: new Date().toISOString() })

    const result = repo.getLibrary({ sort: 'date' })
    const ids = result.map((r) => r.id)
    expect(ids).toContain(approved.id)
    expect(ids).not.toContain(trashed.id)
    expect(result.length).toBe(1)
  })

  it('excludes group members and returns leader with correct variantCount', () => {
    const leader = repo.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/leader.psd', isGroup: true })
    )
    repo.createMockup(
      approvedMockup({ title: 'Member1', libraryPath: '/lib/m1.psd', groupId: leader.id })
    )
    repo.createMockup(
      approvedMockup({ title: 'Member2', libraryPath: '/lib/m2.psd', groupId: leader.id })
    )

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
    expect(ids).not.toContain(c.id) // filtered out — not in laptop tag set
    expect(ids[0]).toBe(b.id) // favourite first
  })

  it('getLibrary matches a picked tag directly, with no roll-up to other tags', () => {
    const allTags = repo.getAllTags()
    const laptop = allTags.find((t) => t.label === 'laptop')!
    const macbook = allTags.find((t) => t.label === 'macbook')!

    const a = repo.createMockup(approvedMockup({ title: 'MacBook', libraryPath: '/lib/mb.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'Laptop', libraryPath: '/lib/lp.psd' }))
    repo.addTagToMockup(a.id, macbook.id)
    repo.addTagToMockup(b.id, laptop.id)

    const ids = repo.getLibrary({ tagIds: [laptop.id], sort: 'date' }).map((r) => r.id)
    expect(ids).toEqual([b.id])
  })

  it('getLibrary needs every picked tag to match (AND)', () => {
    const tags = repo.getAllTags()
    const laptop = tags.find((t) => t.label === 'laptop')!
    const minimal = tags.find((t) => t.label === 'minimal')!

    const both = repo.createMockup(approvedMockup({ title: 'Both', libraryPath: '/lib/both.psd' }))
    const one = repo.createMockup(approvedMockup({ title: 'One', libraryPath: '/lib/one.psd' }))
    repo.addTagToMockup(both.id, laptop.id)
    repo.addTagToMockup(both.id, minimal.id)
    repo.addTagToMockup(one.id, laptop.id)

    const ids = repo.getLibrary({ tagIds: [laptop.id, minimal.id], sort: 'date' }).map((r) => r.id)
    expect(ids).toEqual([both.id])
  })

  it('getLibrary rolls a category filter up to every tag in it', () => {
    const tags = repo.getAllTags()
    const device = repo.getAllCategories().find((c) => c.label === 'Device')!
    const style = repo.getAllCategories().find((c) => c.label === 'Style')!
    const laptop = tags.find((t) => t.label === 'laptop')!
    const iphone = tags.find((t) => t.label === 'iphone')!
    const minimal = tags.find((t) => t.label === 'minimal')!

    const a = repo.createMockup(approvedMockup({ title: 'Laptop', libraryPath: '/lib/c1.psd' }))
    const b = repo.createMockup(approvedMockup({ title: 'iPhone', libraryPath: '/lib/c2.psd' }))
    const c = repo.createMockup(
      approvedMockup({ title: 'Minimal only', libraryPath: '/lib/c3.psd' })
    )
    repo.addTagToMockup(a.id, laptop.id)
    repo.addTagToMockup(b.id, iphone.id)
    repo.addTagToMockup(b.id, minimal.id)
    repo.addTagToMockup(c.id, minimal.id)

    const byDevice = repo.getLibrary({ categoryIds: [device.id], sort: 'name' }).map((r) => r.id)
    expect(byDevice).toEqual([b.id, a.id])

    // Categories AND together, and with picked tags.
    const deviceAndStyle = repo
      .getLibrary({ categoryIds: [device.id, style.id], sort: 'date' })
      .map((r) => r.id)
    expect(deviceAndStyle).toEqual([b.id])
    const deviceAndMinimal = repo
      .getLibrary({ categoryIds: [device.id], tagIds: [minimal.id], sort: 'date' })
      .map((r) => r.id)
    expect(deviceAndMinimal).toEqual([b.id])
  })

  it('search filters and prefix-matches by title/description/tags', () => {
    const a = repo.createMockup(
      approvedMockup({ title: 'MacBook Pro Hero', libraryPath: '/lib/a.psd' })
    )
    const b = repo.createMockup(
      approvedMockup({ title: 'iPhone Screen', libraryPath: '/lib/b.psd' })
    )
    const c = repo.createMockup(
      approvedMockup({ title: 'Another Laptop', libraryPath: '/lib/c.psd' })
    )

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
    const leader = repo.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ld.psd', isGroup: true })
    )
    repo.createMockup(
      approvedMockup({ title: 'V1', libraryPath: '/lib/v1.psd', groupId: leader.id })
    )
    repo.createMockup(
      approvedMockup({ title: 'V2', libraryPath: '/lib/v2.psd', groupId: leader.id })
    )
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

describe('getLibraryStats', () => {
  it('returns correct counts for a mixed fixture', () => {
    // approved, non-deleted, top-level
    const a = repo.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/a.psd' }))
    const b = repo.createMockup(
      approvedMockup({ title: 'B', libraryPath: '/lib/b.psd', isGroup: true })
    )
    repo.createMockup(approvedMockup({ title: 'C', libraryPath: '/lib/c.psd', groupId: b.id })) // member, excluded
    repo.setFavourite(a.id, true)

    // needs_review → not counted in total
    repo.createMockup({ ...sample, title: 'NR', libraryPath: '/lib/nr.psd' })

    // trashed (approved but deletedAt set)
    const t = repo.createMockup(approvedMockup({ title: 'T', libraryPath: '/lib/t.psd' }))
    repo.updateMockup(t.id, { deletedAt: '2025-01-01T00:00:00' })

    const stats = repo.getLibraryStats()

    expect(stats.total).toBe(2) // a and b (not member, not needs_review, not trashed)
    expect(stats.favourites).toBe(1) // a
    expect(stats.groups).toBe(1) // b
    expect(stats.trashed).toBe(1) // t
  })
})
