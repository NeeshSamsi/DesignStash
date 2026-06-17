import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import type { NewMockup } from './schema'
import { Repository } from './repository'
import { seedTaxonomy } from './bootstrap'

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
