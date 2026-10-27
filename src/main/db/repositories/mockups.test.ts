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
    const created = repo.mockups.createMockup(sample)
    expect(created.id).toBeGreaterThan(0)
    expect(created.stage).toBe('to_sort')
    expect(created.favourite).toBe(false)
    expect(created.deletedAt).toBeNull()
    expect(repo.mockups.getMockup(created.id)?.title).toBe('MacBook Mockup')
  })

  it('coverSource: none round-trips through create/read', () => {
    const created = repo.mockups.createMockup({ ...sample, coverSource: 'none' })
    expect(repo.mockups.getMockup(created.id)?.coverSource).toBe('none')
  })

  it('orders favourites first, then newest first', () => {
    repo.mockups.createMockup({ ...sample, title: 'A' })
    const b = repo.mockups.createMockup({ ...sample, title: 'B' })
    repo.mockups.setFavourite(b.id, true)
    const all = repo.mockups.getAllMockups()
    expect(all[0]?.id).toBe(b.id)
  })

  it('setFavourite sets favouritedAt; unfavouriting clears it', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.setFavourite(m.id, true)
    expect(repo.mockups.getMockup(m.id)?.favouritedAt).not.toBeNull()
    repo.mockups.setFavourite(m.id, false)
    expect(repo.mockups.getMockup(m.id)?.favouritedAt).toBeNull()
  })

  it('deleteMockup returns true when found, false when not', () => {
    const m = repo.mockups.createMockup(sample)
    expect(repo.mockups.deleteMockup(m.id)).toBe(true)
    expect(repo.mockups.deleteMockup(m.id)).toBe(false)
  })

  it('getMockup returns undefined after deletion', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.deleteMockup(m.id)
    expect(repo.mockups.getMockup(m.id)).toBeUndefined()
  })
})

describe('Repository — stage', () => {
  it('puts a mockup in review into To sort and an approved one straight into My Stash', () => {
    const fresh = repo.mockups.createMockup(sample)
    const approved = repo.mockups.createMockup(approvedMockup({ libraryPath: '/lib/ap.psd' }))

    expect(fresh).toMatchObject({ stage: 'to_sort', sortedAt: null, sizeBytes: null, aiStatus: 'off' })
    expect(approved.stage).toBe('stashed')
    expect(repo.mockups.createMockup({ ...sample, libraryPath: '/lib/s2.psd', stage: 'to_stash' }).stage).toBe(
      'to_stash'
    )
  })

  it('setStage stamps sortedAt when a mockup leaves To sort, and keeps the first stamp', () => {
    const m = repo.mockups.createMockup(sample)

    repo.mockups.setStage([m.id], 'to_stash')
    const first = repo.mockups.getMockup(m.id)!
    expect(first.stage).toBe('to_stash')
    expect(first.sortedAt).toEqual(expect.any(String))

    repo.mockups.setStage([m.id], 'stashed')
    expect(repo.mockups.getMockup(m.id)).toMatchObject({ stage: 'stashed', sortedAt: first.sortedAt })

    repo.mockups.setStage([m.id], 'to_sort')
    expect(repo.mockups.getMockup(m.id)).toMatchObject({ stage: 'to_sort', sortedAt: null })
  })

  it('setStage with no ids does nothing', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.setStage([], 'stashed')
    expect(repo.mockups.getMockup(m.id)?.stage).toBe('to_sort')
  })
})

describe('Repository — variants', () => {
  it('creates variants ordered by position', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.createVariant({
      mockupId: m.id,
      libraryPath: '/v2.psd',
      coverPath: '/v2.png',
      coverSource: 'embedded',
      position: 1
    })
    repo.mockups.createVariant({
      mockupId: m.id,
      libraryPath: '/v1.psd',
      coverPath: '/v1.png',
      coverSource: 'embedded',
      position: 0
    })
    const variants = repo.mockups.getVariantsForMockup(m.id)
    expect(variants).toHaveLength(2)
    expect(variants[0]?.position).toBe(0)
    expect(variants[1]?.position).toBe(1)
  })

  it('cascade-deletes variants when mockup is deleted', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.createVariant({
      mockupId: m.id,
      libraryPath: '/v1.psd',
      coverPath: '/v1.png',
      coverSource: 'embedded',
      position: 0
    })
    repo.mockups.deleteMockup(m.id)
    expect(repo.mockups.getVariantsForMockup(m.id)).toHaveLength(0)
  })
})

describe('getMockupsByBatchId', () => {
  it('returns only mockups with the matching batchId', () => {
    repo.mockups.createMockup({ ...batchSample('batch-1'), title: 'A', libraryPath: '/lib/a.psd' })
    repo.mockups.createMockup({ ...batchSample('batch-1'), title: 'B', libraryPath: '/lib/b.psd' })
    repo.mockups.createMockup({ ...batchSample('batch-1'), title: 'C', libraryPath: '/lib/c.psd' })
    repo.mockups.createMockup({ ...batchSample('batch-2'), title: 'D', libraryPath: '/lib/d.psd' })
    repo.mockups.createMockup({ ...batchSample('batch-2'), title: 'E', libraryPath: '/lib/e.psd' })
    expect(repo.mockups.getMockupsByBatchId('batch-1')).toHaveLength(3)
    expect(repo.mockups.getMockupsByBatchId('batch-2')).toHaveLength(2)
    expect(repo.mockups.getMockupsByBatchId('batch-99')).toHaveLength(0)
  })
})

describe('setMockupCover', () => {
  it('updates coverPath and coverSource to user-uploaded', () => {
    const m = repo.mockups.createMockup(sample)
    repo.mockups.setMockupCover(m.id, '/new-cover.png', 'user-uploaded')
    const updated = repo.mockups.getMockup(m.id)
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
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Old Title', libraryPath: '/lib/om.psd' }))
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const phone = repo.tags.getAllTags().find((t) => t.label === 'Phone')!
    repo.mockups.addTagToMockup(m.id, phone.id)
    repo.search.upsertSearchIndex(m.id)

    repo.mockups.updateMockupMeta(m.id, { title: 'New Title', description: 'Updated', tagIds: [laptop.id] })

    const updated = repo.mockups.getMockup(m.id)!
    expect(updated.title).toBe('New Title')
    expect(updated.description).toBe('Updated')
    expect(repo.mockups.getTagsForMockup(m.id).map((t) => t.label)).toEqual(['Laptop'])

    const rows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('New') as { rowid: number }[]
    expect(rows.map((r) => r.rowid)).toContain(m.id)

    const oldRows = sqlite
      .prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`)
      .all('Old') as { rowid: number }[]
    expect(oldRows.map((r) => r.rowid)).not.toContain(m.id)
  })

  it('refuses a mockup that no longer exists, and writes nothing', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!

    expect(() =>
      repo.mockups.updateMockupMeta(9999, { title: 'Gone', description: '', tagIds: [laptop.id] })
    ).toThrow('Mockup 9999 not found')
    expect(sqlite.prepare('SELECT count(*) AS n FROM mockup_tags').get()).toEqual({ n: 0 })
  })

  it('refuses a title of only spaces, and keeps a title without the spaces around it', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Mug', libraryPath: '/lib/sp.psd' }))

    expect(() => repo.mockups.updateMockupMeta(m.id, { title: '   ', description: '', tagIds: [] })).toThrow(
      'A mockup needs a title'
    )
    expect(repo.mockups.getMockup(m.id)?.title).toBe('Mug')

    repo.mockups.updateMockupMeta(m.id, { title: '  Clay mug ', description: '', tagIds: [] })
    expect(repo.mockups.getMockup(m.id)?.title).toBe('Clay mug')
  })

  it('leaves a mockup in Trash out of search when its details are saved', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Binned', libraryPath: '/lib/bn.psd' }))
    repo.trash.moveToTrash(m.id)

    repo.mockups.updateMockupMeta(m.id, { title: 'Binned again', description: '', tagIds: [] })

    expect(repo.search.isIndexed(m.id)).toBe(false)
  })
})
