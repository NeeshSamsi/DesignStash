import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from './schema'
import { seedTaxonomy, bootstrapLibrary, SEED_LABEL_RENAMES } from './bootstrap'
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
        'mockup_embeddings'
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
      // Seeded slugs read as display labels now (migration 0008).
      { id: 1, label: 'Phone', category_id: 1 },
      { id: 2, label: 'iPhone', category_id: 1 }
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

describe('migration: seed tag display labels', () => {
  /** A copy of ./drizzle whose journal stops before the display-label rename. */
  function migrationsBeforeLabels(): string {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_seed_tag_labels'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))
    return dir
  }

  it('renames seeded slugs, leaves user and AI tags alone, and keeps every mockup link', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeLabels() })

    old.exec(`
      INSERT INTO tag_categories (id, label) VALUES (1, 'Device'), (2, 'Apparel');
      INSERT INTO tags (id, label, category_id, created_by) VALUES
        (1, 'iphone', 1, 'seed'),
        (2, 'android-phone', 1, 'seed'),
        (3, 't-shirt', 2, 'seed'),
        (4, 'iphone', 2, 'user'),          -- a user's own tag with the same text: not ours
        (5, 'tote-bag', 2, 'ai'),           -- an AI tag with a seed slug: not ours either
        (6, 'my-own-thing', 1, 'user'),     -- never a seed slug
        (7, 'Clay', 1, 'user'),             -- already a display label
        (8, 'ipad', 1, 'seed'),
        (9, 'iPad', 1, 'user');             -- taken already, so the seeded one stays as it is
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source)
        VALUES (1, 'Clay iPhone', '/lib/a.psd', '/lib/a.png', 'embedded');
      INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (1, 1), (1, 4), (1, 6);
    `)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    expect(old.prepare('SELECT id, label, created_by FROM tags ORDER BY id').all()).toEqual([
      { id: 1, label: 'iPhone', created_by: 'seed' },
      { id: 2, label: 'Android phone', created_by: 'seed' },
      { id: 3, label: 'T-shirt', created_by: 'seed' },
      { id: 4, label: 'iphone', created_by: 'user' },
      { id: 5, label: 'tote-bag', created_by: 'ai' },
      { id: 6, label: 'my-own-thing', created_by: 'user' },
      { id: 7, label: 'Clay', created_by: 'user' },
      { id: 8, label: 'ipad', created_by: 'seed' },
      { id: 9, label: 'iPad', created_by: 'user' }
    ])
    expect(old.prepare('SELECT count(*) AS c FROM mockup_tags').get()).toEqual({ c: 3 })
    expect(old.pragma('foreign_key_check')).toEqual([])
    old.close()
  })

  it('renames every old seed slug, and only those', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeLabels() })
    old.exec(`INSERT INTO tag_categories (id, label) VALUES (1, 'Device');`)
    const insert = old.prepare("INSERT INTO tags (label, category_id, created_by) VALUES (?, 1, 'seed')")
    for (const slug of Object.keys(SEED_LABEL_RENAMES)) insert.run(slug)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const after = (old.prepare('SELECT label FROM tags ORDER BY id').all() as { label: string }[]).map((r) => r.label)
    expect(after).toEqual(Object.values(SEED_LABEL_RENAMES))
    old.close()
  })

  it('a database that is already migrated is left as it is when the migration runs again', () => {
    seedTaxonomy(db)
    const before = db.select().from(schema.tags).all().map((t) => t.label)
    migrate(db, { migrationsFolder: './drizzle' })
    expect(db.select().from(schema.tags).all().map((t) => t.label)).toEqual(before)
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
    expect(labels).toEqual(expect.arrayContaining(['Laptop', 'MacBook', 'Phone', 'iPhone']))
  })

  it('seeds display labels: sentence case, with iPhone, iPad, MacBook and T-shirt keeping their own casing', () => {
    seedTaxonomy(db)
    const labels = db.select().from(schema.tags).all().map((t) => t.label)

    expect(labels).toEqual(
      expect.arrayContaining([
        'iPhone', 'iPad', 'MacBook', 'iMac', 'Apple Watch', 'Android phone', 'Windows laptop',
        'Business card', 'T-shirt', 'Tote bag', 'Flat lay', '3D render', 'Top-down', 'TV'
      ])
    )
    // No slugs left: nothing lowercase-with-hyphens that reads like an id.
    expect(labels.filter((l) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(l))).toEqual([])
    // Every seed label is the new label of exactly one old slug, and sentence case holds.
    expect([...labels].sort()).toEqual(Object.values(SEED_LABEL_RENAMES).sort())
    // Each starts with a capital or a digit, except the i-products (iPhone, iPad, iMac).
    for (const label of labels) expect(label).toMatch(/^([A-Z0-9]|i[A-Z])/)
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
  it('creates mockups/, and no models/ (models live in app data)', () => {
    const root = tempDir()
    bootstrapLibrary(root)
    expect(existsSync(join(root, 'mockups'))).toBe(true)
    expect(existsSync(join(root, 'models'))).toBe(false)
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

describe('migration: drop review status, add the pile check', () => {
  /** A copy of ./drizzle whose journal stops before review_status goes. */
  function migrationsBeforeDrop(): string {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_drop_review_status'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))
    return dir
  }

  const count = (db: Database.Database, table: string) =>
    (db.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c

  it('keeps every mockup and every child table, and fixes a row that was top and member', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeDrop() })
    expect(
      old.prepare('PRAGMA table_info(mockups)').all().map((r) => (r as { name: string }).name)
    ).toContain('review_status')

    old.exec(`
      INSERT INTO tag_categories (id, label) VALUES (1, 'Device');
      INSERT INTO tags (id, label, category_id) VALUES (1, 'Phone', 1), (2, 'Laptop', 1);
      INSERT INTO copy_hauls (id) VALUES ('h1');
      -- 1 and 2: a pile (top 1), 3: on its own and in review, 4: a stale row that is top and member
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, stage, is_group)
        VALUES (1, 'Top', '/lib/1.psd', '/lib/1.png', 'embedded', 'approved', 'stashed', 1);
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, stage, group_id)
        VALUES (2, 'Side', '/lib/2.psd', '/lib/2.png', 'embedded', 'approved', 'stashed', 1);
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, stage, favourite)
        VALUES (3, 'Waiting', '/lib/3.psd', '/lib/3.png', 'embedded', 'needs_review', 'to_stash', 1);
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, review_status, stage, is_group, group_id)
        VALUES (4, 'Stale', '/lib/4.psd', '/lib/4.png', 'embedded', 'approved', 'stashed', 1, 1);
      INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (1, 1), (2, 1), (3, 2);
      INSERT INTO drafts (mockup_id, title) VALUES (3, 'Waiting draft');
      INSERT INTO look_over_resume (unit_id, mockup_id) VALUES (3, 3);
      INSERT INTO variants (mockup_id, library_path, cover_path, cover_source)
        VALUES (1, '/lib/v.psd', '/lib/v.png', 'embedded');
      INSERT INTO embeddings (mockup_id, vector, model_id) VALUES (2, x'00', 'm');
      INSERT INTO copy_jobs (haul_id, source_path, file_name, status, mockup_id)
        VALUES ('h1', '/src/3.psd', '3.psd', 'done', 3);
    `)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const cols = old
      .prepare('PRAGMA table_info(mockups)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).not.toContain('review_status')
    expect(old.prepare('SELECT id, title, stage, is_group, group_id, favourite FROM mockups ORDER BY id').all()).toEqual([
      { id: 1, title: 'Top', stage: 'stashed', is_group: 1, group_id: null, favourite: 0 },
      { id: 2, title: 'Side', stage: 'stashed', is_group: 0, group_id: 1, favourite: 0 },
      { id: 3, title: 'Waiting', stage: 'to_stash', is_group: 0, group_id: null, favourite: 1 },
      { id: 4, title: 'Stale', stage: 'stashed', is_group: 1, group_id: null, favourite: 0 }
    ])
    // Every table that points at a mockup kept its rows.
    expect(count(old, 'mockup_tags')).toBe(3)
    expect(count(old, 'drafts')).toBe(1)
    expect(count(old, 'look_over_resume')).toBe(1)
    expect(count(old, 'variants')).toBe(1)
    // The unused `embeddings` placeholder was replaced by `mockup_embeddings` (migration 0013).
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name = 'embeddings'").all()).toEqual([])
    expect(count(old, 'copy_jobs')).toBe(1)
    expect(old.prepare('SELECT mockup_id FROM copy_jobs').get()).toEqual({ mockup_id: 3 })
    expect(count(old, 'tags')).toBe(2)
    expect(old.pragma('foreign_key_check')).toEqual([])
    // The scratch copies are gone and the links still cascade.
    const names = (old.prepare("SELECT name FROM sqlite_master WHERE name LIKE '\\_\\_%' ESCAPE '\\'").all() as { name: string }[]).map((r) => r.name)
    expect(names.filter((n) => n.endsWith('_backup'))).toEqual([])
    old.prepare('DELETE FROM mockups WHERE id = 3').run()
    expect(count(old, 'drafts')).toBe(0)
    expect(count(old, 'mockup_tags')).toBe(2)
    old.close()
  })

  it('refuses a row that is both a pile top and a member', () => {
    expect(() =>
      sqlite.exec(`
        INSERT INTO mockups (id, title, library_path, cover_path, cover_source) VALUES (1, 'T', '/l/1', '/c/1', 'embedded');
        INSERT INTO mockups (id, title, library_path, cover_path, cover_source, is_group, group_id)
          VALUES (2, 'Both', '/l/2', '/c/2', 'embedded', 1, 1);
      `)
    ).toThrow(/CHECK constraint failed/)
  })
})

describe('migration: copy jobs from zips', () => {
  /** A copy of ./drizzle whose journal stops before the archive columns. */
  function migrationsBeforeArchives(): string {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_copy_job_archives'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))
    return dir
  }

  it('adds the zip entry and zip name to copy jobs, empty for the jobs already there', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: migrationsBeforeArchives() })
    old.exec(`
      INSERT INTO copy_hauls (id) VALUES ('h1');
      INSERT INTO copy_jobs (haul_id, source_path, file_name, size_bytes) VALUES ('h1', '/src/a.psd', 'a.psd', 9);
    `)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    expect(
      old.prepare('SELECT source_path, file_name, size_bytes, archive_entry, archive_name FROM copy_jobs').get()
    ).toEqual({ source_path: '/src/a.psd', file_name: 'a.psd', size_bytes: 9, archive_entry: null, archive_name: null })
    old.close()
  })
})

describe('migration: search keywords', () => {
  it('replaces mockups_fts with one that has a keywords column, on a database at 0011', () => {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_search_keywords'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))

    const old = new Database(':memory:')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: dir })
    old.exec('CREATE VIRTUAL TABLE mockups_fts USING fts5(title, description, tags)')

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const cols = old
      .prepare('PRAGMA table_info(mockups_fts)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toEqual(['title', 'description', 'tags', 'keywords'])
    old
      .prepare('INSERT INTO mockups_fts(rowid, title, description, tags, keywords) VALUES (2, ?, ?, ?, ?)')
      .run('Bag', '', '', 'shopper')
    const hit = old.prepare("SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH 'shopper'").all()
    expect(hit).toEqual([{ rowid: 2 }])
    old.close()
  })
})

describe('migration: meaning embeddings', () => {
  it('applies on a database at 0012 and keeps its mockups', () => {
    const dir = tempDir()
    cpSync('./drizzle', dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
    const cut = journal.entries.findIndex((e) => e.tag.endsWith('_meaning_embeddings'))
    expect(cut).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, cut)
    writeFileSync(journalPath, JSON.stringify(journal))

    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    const oldDb = drizzle(old, { schema })
    migrate(oldDb, { migrationsFolder: dir })
    old.exec(`INSERT INTO mockups (id, title, library_path, cover_path, cover_source)
      VALUES (1, 'Tote', '/lib/a.psd', '/lib/a.png', 'embedded')`)

    migrate(oldDb, { migrationsFolder: './drizzle' })

    const cols = old
      .prepare('PRAGMA table_info(mockup_embeddings)')
      .all()
      .map((r) => (r as { name: string }).name)
    expect(cols).toEqual(['mockup_id', 'model_id', 'dimension', 'vector', 'text_hash'])
    expect(old.prepare('SELECT count(*) AS c FROM mockups').get()).toEqual({ c: 1 })
    old
      .prepare('INSERT INTO mockup_embeddings VALUES (1, ?, 2, x\'0000\', ?)')
      .run('nomic-embed-v1.5', 'h')
    old.prepare('DELETE FROM mockups WHERE id = 1').run()
    expect(old.prepare('SELECT count(*) AS c FROM mockup_embeddings').get()).toEqual({ c: 0 })
    old.close()
  })
})
