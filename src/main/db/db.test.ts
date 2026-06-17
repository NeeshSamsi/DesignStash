import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { isNotNull, isNull } from 'drizzle-orm'
import * as schema from './schema'
import { seedTaxonomy, bootstrapLibrary } from './bootstrap'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-db-'))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(() => {
  sqlite.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('migrations', () => {
  it('creates all expected tables', () => {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'mockups',
        'variants',
        'tag_categories',
        'tags',
        'mockup_tags',
        'embeddings'
      ])
    )
  })

  it('mockups table has a deleted_at column', () => {
    const cols = sqlite
      .prepare('PRAGMA table_info(mockups)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toContain('deleted_at')
  })

  it('enforces foreign key constraint on mockup_tags', () => {
    expect(() => {
      sqlite.prepare('INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (9999, 9999)').run()
    }).toThrow()
  })

  it('enforces unique index on (category_id, label) in tags', () => {
    db.insert(schema.tagCategories).values({ label: 'TestCat', sortOrder: 99 }).run()
    const cat = db.select().from(schema.tagCategories).get()!
    db.insert(schema.tags).values({ label: 'dup', categoryId: cat.id, createdBy: 'seed' }).run()
    expect(() => {
      db.insert(schema.tags).values({ label: 'dup', categoryId: cat.id, createdBy: 'seed' }).run()
    }).toThrow()
  })
})

describe('seedTaxonomy', () => {
  it('seeds all 6 categories', () => {
    seedTaxonomy(db)
    expect(db.select().from(schema.tagCategories).all()).toHaveLength(6)
  })

  it('seeds child tags with parentTagId set', () => {
    seedTaxonomy(db)
    const children = db.select().from(schema.tags).where(isNotNull(schema.tags.parentTagId)).all()
    expect(children.length).toBeGreaterThan(0)
  })

  it('all seeded tags have createdBy=seed', () => {
    seedTaxonomy(db)
    const nonSeed = db
      .select()
      .from(schema.tags)
      .where(isNull(schema.tags.parentTagId))
      .all()
      .filter((t) => t.createdBy !== 'seed')
    expect(nonSeed).toHaveLength(0)
  })

  it('is idempotent — second call does not duplicate categories', () => {
    seedTaxonomy(db)
    seedTaxonomy(db)
    expect(db.select().from(schema.tagCategories).all()).toHaveLength(6)
  })
})

describe('bootstrapLibrary', () => {
  it('creates mockups/ and models/ directories', () => {
    const root = tempDir()
    bootstrapLibrary(root)
    expect(existsSync(join(root, 'mockups'))).toBe(true)
    expect(existsSync(join(root, 'models'))).toBe(true)
  })

  it('creates a config.json version marker', () => {
    const root = tempDir()
    bootstrapLibrary(root)
    expect(existsSync(join(root, 'config.json'))).toBe(true)
  })

  it('is idempotent — safe to call twice', () => {
    const root = tempDir()
    bootstrapLibrary(root)
    expect(() => bootstrapLibrary(root)).not.toThrow()
  })
})
