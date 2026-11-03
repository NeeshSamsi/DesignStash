import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { Repository } from './repository'
import { seedTaxonomy } from './bootstrap'
import { TagService } from './tag-service'
import { ensureSearchIndex } from './search-index'
import { IPC_CONTRACT, IPC_CHANNELS } from '@shared/ipc'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository
let svc: TagService

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  seedTaxonomy(db)
  repo = new Repository(db)
  svc = new TagService(repo)
})

afterEach(() => sqlite.close())

describe('TagService.snapTags', () => {
  it('snaps to an existing seeded tag without creating a duplicate', async () => {
    const before = repo.tags.getAllTags().filter((t) => t.label === 'Laptop').length
    const ids = await svc.snapTags([{ category: 'Device', label: 'Laptop' }])
    expect(ids).toHaveLength(1)
    const after = repo.tags.getAllTags().filter((t) => t.label === 'Laptop').length
    expect(after).toBe(before) // no duplicate created
  })

  it('snaps a suggestion to the seeded display label whatever its casing, spaces or hyphens', async () => {
    const byLabel = (label: string) => repo.tags.getAllTags().find((t) => t.label === label)!
    const before = repo.tags.getAllTags().length

    const ids = await svc.snapTags([
      { category: 'Device', label: 'iphone' },
      { category: 'device', label: 'android phone' },
      { category: 'Device', label: 'Android-Phone' },
      { category: 'Device', label: 'IPAD' },
      { category: 'Apparel', label: 't shirt' },
      { category: 'Apparel', label: 'tote-bag' }
    ])

    expect(ids).toEqual([
      byLabel('iPhone').id,
      byLabel('Android phone').id,
      byLabel('iPad').id,
      byLabel('T-shirt').id,
      byLabel('Tote bag').id
    ])
    // Nothing new was made: every suggestion found its tag.
    expect(repo.tags.getAllTags()).toHaveLength(before)
    expect(repo.tags.getAllCategories()).toHaveLength(6)
  })

  it('keeps the casing of a tag it invents, trimmed, and finds it again however it is written', async () => {
    const [id] = await svc.snapTags([{ category: 'Device', label: '  Vision  Pro ' }])
    const tag = repo.tags.getAllTags().find((t) => t.id === id)!
    expect(tag).toMatchObject({ label: 'Vision Pro', createdBy: 'suggestion', isCanonical: false })

    expect(await svc.snapTags([{ category: 'Device', label: 'vision-pro' }])).toEqual([id])
  })

  it('does not match across categories', async () => {
    const [id] = await svc.snapTags([{ category: 'Style', label: 'front' }])
    const tag = repo.tags.getAllTags().find((t) => t.id === id)!
    expect(tag.label).toBe('front')
    expect(repo.tags.getAllCategories().find((c) => c.id === tag.categoryId)?.label).toBe('Style')
  })

  it('makes a new category and tag when absent, as suggestions until they land on a mockup (F-034)', async () => {
    const ids = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    expect(ids).toHaveLength(1)
    const tag = repo.tags.getAllTags().find((t) => t.label === 'brandnewtag')
    expect(tag).toBeDefined()
    expect(tag?.isCanonical).toBe(false)
    expect(tag?.createdBy).toBe('suggestion')
    const cat = repo.tags.getAllCategories().find((c) => c.label === 'BrandNewCat')
    expect(cat).toBeDefined()
    expect(cat).toMatchObject({ isCanonical: false, suggestion: true })
  })

  it('reuses a newly-created tag on second call (find-or-create, no duplicate)', async () => {
    const [id1] = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    const [id2] = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    expect(id1).toBe(id2)
    const count = repo.tags.getAllTags().filter((t) => t.label === 'brandnewtag').length
    expect(count).toBe(1)
  })

  it('dedupes within one call — same {category,label} twice returns one id', async () => {
    const ids = await svc.snapTags([
      { category: 'BrandNewCat', label: 'dupetest' },
      { category: 'BrandNewCat', label: 'dupetest' }
    ])
    expect(ids).toHaveLength(1)
  })

  it('returns the right number of ids for a mix of existing and new tags', async () => {
    const ids = await svc.snapTags([
      { category: 'Device', label: 'Laptop' },
      { category: 'BrandNewCat', label: 'freshone' }
    ])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe('TagService · TagTree operations (IPC handler layer)', () => {
  beforeEach(() => ensureSearchIndex(db))

  const approved = (title: string, libraryPath: string) =>
    repo.mockups.createMockup({
      title,
      libraryPath,
      coverPath: '/c.png',
      coverSource: 'embedded',
      stage: 'stashed'
    })

  it('deleteTag matches its IPC contract', () => {
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    const m = approved('Svc', '/lib/svc.psd')
    repo.mockups.addTagToMockup(m.id, laptop.id)

    const deleted = svc.deleteTag({ tagId: laptop.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.TAG_DELETE].response.parse(deleted)).toEqual(deleted)
    expect(deleted.affectedMockups).toBe(1)
  })

  it('previewMergeTags matches its IPC contract', () => {
    const all = repo.tags.getAllTags()
    const macbook = all.find((t) => t.label === 'MacBook')!
    const laptop = all.find((t) => t.label === 'Laptop')!
    const preview = svc.previewMergeTags({ sourceTagId: macbook.id, targetTagId: laptop.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE_PREVIEW].response.parse(preview)).toEqual({
      affectedMockups: 0
    })
  })

  it('deleteCategory, with and without a target, matches its IPC contract', () => {
    const cats = repo.tags.getAllCategories()
    const angle = cats.find((c) => c.label === 'Angle')!
    const style = cats.find((c) => c.label === 'Style')!

    const moved = svc.deleteCategory({ categoryId: angle.id, moveTagsTo: style.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.CATEGORY_DELETE].response.parse(moved)).toEqual(moved)
    expect(moved).toMatchObject({ deleted: true, movedTags: 4 })

    const empty = repo.tags.createCategory({ label: 'Mood' })
    const deleted = svc.deleteCategory({ categoryId: empty.id })
    expect(deleted.movedTags).toBe(0)
    expect(IPC_CONTRACT[IPC_CHANNELS.CATEGORY_DELETE].response.parse(deleted)).toEqual(deleted)
  })
})
