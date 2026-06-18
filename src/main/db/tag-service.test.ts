import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { Repository } from './repository'
import { seedTaxonomy } from './bootstrap'
import { TagService } from './tag-service'

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
