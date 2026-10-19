import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { approvedMockup, batchSample, createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
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

  it('coverSource: none round-trips through create/read', () => {
    const created = repo.createMockup({ ...sample, coverSource: 'none' })
    expect(repo.getMockup(created.id)?.coverSource).toBe('none')
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
    repo.createVariant({
      mockupId: m.id,
      libraryPath: '/v2.psd',
      coverPath: '/v2.png',
      coverSource: 'embedded',
      position: 1
    })
    repo.createVariant({
      mockupId: m.id,
      libraryPath: '/v1.psd',
      coverPath: '/v1.png',
      coverSource: 'embedded',
      position: 0
    })
    const variants = repo.getVariantsForMockup(m.id)
    expect(variants).toHaveLength(2)
    expect(variants[0]?.position).toBe(0)
    expect(variants[1]?.position).toBe(1)
  })

  it('cascade-deletes variants when mockup is deleted', () => {
    const m = repo.createMockup(sample)
    repo.createVariant({
      mockupId: m.id,
      libraryPath: '/v1.psd',
      coverPath: '/v1.png',
      coverSource: 'embedded',
      position: 0
    })
    repo.deleteMockup(m.id)
    expect(repo.getVariantsForMockup(m.id)).toHaveLength(0)
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
