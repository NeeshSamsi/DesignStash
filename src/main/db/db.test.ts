import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from './schema'
import { seedTaxonomy, bootstrapLibrary } from './bootstrap'
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
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

  it('tags are two tiers: the tags table holds only a category, no parent', () => {
    const cols = sqlite
      .prepare('PRAGMA table_info(tags)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toEqual(['id', 'label', 'category_id', 'is_canonical', 'created_by'])
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

describe('migration: drop tag nesting', () => {
  /** A copy of ./drizzle whose journal stops before the nesting drop. */
  function migrationsBeforeNestingDrop(): string {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[]
    }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_drop_tag_parent'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))
    return dir
  }

  it('keeps tags and mockup tag links on a database that had parent links', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeNestingDrop() })

    // The pre-drop tags table: id, label, category_id, parent, is_canonical, created_by.
    // Insert positionally so 'iphone' is nested under 'phone'.
    const legacyCols = old.prepare('PRAGMA table_info(tags)').all()
    expect(legacyCols).toHaveLength(6)
    old.exec(`
      INSERT INTO tag_categories (id, label) VALUES (1, 'Device');
      INSERT INTO tags VALUES (1, 'phone', 1, NULL, 1, 'seed');
      INSERT INTO tags VALUES (2, 'iphone', 1, 1, 1, 'seed');
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source)
        VALUES (1, 'Clay iPhone', '/lib/a.psd', '/lib/a.png', 'embedded');
      INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (1, 1), (1, 2);
    `)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const cols = old
      .prepare('PRAGMA table_info(tags)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toEqual(['id', 'label', 'category_id', 'is_canonical', 'created_by'])
    expect(old.prepare('SELECT id, label, category_id FROM tags ORDER BY id').all()).toEqual([
      { id: 1, label: 'phone', category_id: 1 },
      { id: 2, label: 'iphone', category_id: 1 }
    ])
    expect(old.prepare('SELECT count(*) AS c FROM mockup_tags').get()).toEqual({ c: 2 })
    expect(old.pragma('foreign_key_check')).toEqual([])
    old.close()
  })
})

describe('migration: inbox stage', () => {
  /** A copy of ./drizzle whose journal stops before the inbox stage columns. */
  function migrationsBeforeInboxStage(): string {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[]
    }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_inbox_stage'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))
    return dir
  }

  const row = (db: Database.Database, id: number) =>
    db.prepare('SELECT stage, sorted_at, size_bytes, ai_status, ai_result FROM mockups WHERE id = ?').get(id)

  it('sorts existing mockups into the right stage and keeps every row and link', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeInboxStage() })

    old.exec(`
      INSERT INTO tag_categories (id, label) VALUES (1, 'Device');
      INSERT INTO tags (id, label, category_id) VALUES (1, 'phone', 1);
      -- 1: approved and in My Stash
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, updated_at)
        VALUES (1, 'Stashed', '/lib/1.psd', '/lib/1.png', 'embedded', 'approved', '2026-01-01 10:00:00');
      -- 2: imported, never grouped
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status)
        VALUES (2, 'Fresh', '/lib/2.psd', '/lib/2.png', 'embedded', 'needs_review');
      -- 3 and 4: a pile that grouping confirmed (leader and member), still in review
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, is_group, updated_at)
        VALUES (3, 'Pile top', '/lib/3.psd', '/lib/3.png', 'embedded', 'needs_review', 1, '2026-02-01 10:00:00');
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, group_id)
        VALUES (4, 'Pile side', '/lib/4.psd', '/lib/4.png', 'embedded', 'needs_review', 3);
      -- 5: an approved pile member
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, group_id)
        VALUES (5, 'Stashed side', '/lib/5.psd', '/lib/5.png', 'embedded', 'approved', 1);
      -- 6: trashed, approved
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, deleted_at)
        VALUES (6, 'Trashed', '/lib/6.psd', '/lib/6.png', 'embedded', 'approved', '2026-03-01 10:00:00');
      INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (1, 1), (3, 1);
    `)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const stages = old.prepare('SELECT id, stage FROM mockups ORDER BY id').all()
    expect(stages).toEqual([
      { id: 1, stage: 'stashed' },
      { id: 2, stage: 'to_sort' },
      { id: 3, stage: 'to_stash' },
      { id: 4, stage: 'to_stash' },
      { id: 5, stage: 'stashed' },
      { id: 6, stage: 'stashed' }
    ])
    // Rows that left To sort get a sorted date; the unsorted one has none.
    expect(row(old, 1)).toMatchObject({ sorted_at: '2026-01-01 10:00:00' })
    expect(row(old, 3)).toMatchObject({ sorted_at: '2026-02-01 10:00:00' })
    expect(row(old, 2)).toMatchObject({ sorted_at: null })
    // New columns start empty and the AI is off for old data.
    expect(row(old, 2)).toMatchObject({ size_bytes: null, ai_status: 'off', ai_result: null })
    // Nothing was lost.
    expect(old.prepare('SELECT count(*) AS c FROM mockups').get()).toEqual({ c: 6 })
    expect(old.prepare('SELECT count(*) AS c FROM mockup_tags').get()).toEqual({ c: 2 })
    expect(old.pragma('foreign_key_check')).toEqual([])
    old.close()
  })

  it('has the five new columns on a fresh database', () => {
    const cols = sqlite
      .prepare('PRAGMA table_info(mockups)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toEqual(
      expect.arrayContaining(['stage', 'sorted_at', 'size_bytes', 'ai_status', 'ai_result'])
    )
  })
})

describe('seedTaxonomy', () => {
  it('seeds all 6 categories', () => {
    seedTaxonomy(db)
    expect(db.select().from(schema.tagCategories).all()).toHaveLength(6)
  })

  it('seeds a flat tag list under each category', () => {
    seedTaxonomy(db)
    const device = db
      .select()
      .from(schema.tagCategories)
      .where(eq(schema.tagCategories.label, 'Device'))
      .get()!
    const labels = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.categoryId, device.id))
      .all()
      .map((t) => t.label)
    expect(labels).toEqual(expect.arrayContaining(['laptop', 'macbook', 'phone', 'iphone']))
  })

  it('all seeded tags have createdBy=seed', () => {
    seedTaxonomy(db)
    const nonSeed = db
      .select()
      .from(schema.tags)
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
