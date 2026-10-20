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
    const before = repo.getAllTags().filter((t) => t.label === 'laptop').length
    const ids = await svc.snapTags([{ category: 'Device', label: 'laptop' }])
    expect(ids).toHaveLength(1)
    const after = repo.getAllTags().filter((t) => t.label === 'laptop').length
    expect(after).toBe(before) // no duplicate created
  })

  it('creates a new category and tag when absent, marked non-canonical + ai', async () => {
    const ids = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    expect(ids).toHaveLength(1)
    const tag = repo.getAllTags().find((t) => t.label === 'brandnewtag')
    expect(tag).toBeDefined()
    expect(tag?.isCanonical).toBe(false)
    expect(tag?.createdBy).toBe('ai')
    const cat = repo.getAllCategories().find((c) => c.label === 'BrandNewCat')
    expect(cat).toBeDefined()
    expect(cat?.isCanonical).toBe(false)
  })

  it('reuses a newly-created tag on second call (find-or-create, no duplicate)', async () => {
    const [id1] = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    const [id2] = await svc.snapTags([{ category: 'BrandNewCat', label: 'brandnewtag' }])
    expect(id1).toBe(id2)
    const count = repo.getAllTags().filter((t) => t.label === 'brandnewtag').length
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
      { category: 'Device', label: 'laptop' },
      { category: 'BrandNewCat', label: 'freshone' }
    ])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe('TagService · TagTree operations (IPC handler layer)', () => {
  beforeEach(() => ensureSearchIndex(db))

  const approved = (title: string, libraryPath: string) =>
    repo.createMockup({
      title,
      libraryPath,
      coverPath: '/c.png',
      coverSource: 'embedded',
      reviewStatus: 'approved'
    })

  it('deleteTag and restoreTag round-trip and match their IPC contracts', () => {
    const laptop = repo.getAllTags().find((t) => t.label === 'laptop')!
    const m = approved('Svc', '/lib/svc.psd')
    repo.addTagToMockup(m.id, laptop.id)

    const deleted = svc.deleteTag({ tagId: laptop.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.TAG_DELETE].response.parse(deleted)).toEqual(deleted)
    expect(deleted.affectedMockups).toBe(1)

    const request = IPC_CONTRACT[IPC_CHANNELS.TAG_RESTORE].request.parse({
      snapshot: deleted.snapshot
    })
    const restored = svc.restoreTag(request)
    expect(IPC_CONTRACT[IPC_CHANNELS.TAG_RESTORE].response.parse(restored)).toEqual({
      tagId: laptop.id,
      restoredMockups: 1
    })
  })

  it('previewMergeTags matches its IPC contract', () => {
    const all = repo.getAllTags()
    const macbook = all.find((t) => t.label === 'macbook')!
    const laptop = all.find((t) => t.label === 'laptop')!
    const preview = svc.previewMergeTags({ sourceTagId: macbook.id, targetTagId: laptop.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.TAG_MERGE_PREVIEW].response.parse(preview)).toEqual({
      affectedMockups: 0
    })
  })

  it('deleteCategory (with and without a target) and restoreCategory match their IPC contracts', () => {
    const cats = repo.getAllCategories()
    const angle = cats.find((c) => c.label === 'Angle')!
    const style = cats.find((c) => c.label === 'Style')!

    const moved = svc.deleteCategory({ categoryId: angle.id, moveTagsTo: style.id })
    expect(IPC_CONTRACT[IPC_CHANNELS.CATEGORY_DELETE].response.parse(moved)).toEqual(moved)
    expect(moved).toMatchObject({ deleted: true, movedTags: 4 })

    const empty = repo.createCategory({ label: 'Mood' })
    const deleted = svc.deleteCategory({ categoryId: empty.id })
    expect(deleted.movedTags).toBe(0)
    const restored = svc.restoreCategory(
      IPC_CONTRACT[IPC_CHANNELS.CATEGORY_RESTORE].request.parse({ snapshot: deleted.snapshot })
    )
    expect(IPC_CONTRACT[IPC_CHANNELS.CATEGORY_RESTORE].response.parse(restored)).toEqual({
      categoryId: empty.id
    })
  })

})
