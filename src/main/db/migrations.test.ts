import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from './schema'

const dirs: string[] = []
const open: Database.Database[] = []

afterEach(() => {
  for (const db of open.splice(0)) db.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A copy of ./drizzle whose journal stops before the migration whose tag ends with `tagEnd`. */
function migrationsBefore(tagEnd: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ds-migrations-'))
  dirs.push(dir)
  cpSync('./drizzle', dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  const cut = journal.entries.findIndex((e) => e.tag.endsWith(tagEnd))
  expect(cut).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, cut)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}

/** A database migrated up to just before `tagEnd`, and a way to run the rest. */
function databaseBefore(tagEnd: string) {
  const sqlite = new Database(':memory:')
  open.push(sqlite)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsBefore(tagEnd) })
  return { sqlite, migrateRest: () => migrate(db, { migrationsFolder: './drizzle' }) }
}

describe('indexes for the library’s lookups', () => {
  /** How SQLite plans to answer `query`, as one line per step. */
  const plan = (query: string) => {
    const sqlite = new Database(':memory:')
    open.push(sqlite)
    migrate(drizzle(sqlite, { schema }), { migrationsFolder: './drizzle' })
    return (sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as { detail: string }[])
      .map((r) => r.detail)
      .join('\n')
  }

  it('finds a pile’s mockups by their top without reading every mockup', () => {
    expect(plan('SELECT id FROM mockups WHERE group_id = 7')).toContain('mockups_group_deleted_idx')
  })

  it('counts and lists Trash without reading every mockup', () => {
    expect(
      plan('SELECT count(*) FROM mockups WHERE deleted_at IS NOT NULL AND group_id IS NULL')
    ).toContain('mockups_group_deleted_idx')
  })

  it('counts an inbox without reading every mockup', () => {
    expect(
      plan(`SELECT count(*) FROM mockups WHERE deleted_at IS NULL AND stage = 'to_sort'`)
    ).toContain('mockups_stage_deleted_idx')
  })

  it('checks an imported file for a duplicate by its hash without reading every mockup', () => {
    expect(plan(`SELECT id FROM mockups WHERE content_hash = 'abc'`)).toContain(
      'mockups_content_hash_idx'
    )
  })

  it('finds the mockups carrying a tag without reading every link', () => {
    expect(plan('SELECT mockup_id FROM mockup_tags WHERE tag_id = 3')).toContain(
      'mockup_tags_tag_id_idx'
    )
  })
})

describe('migration: free trashed pile members', () => {
  const insert = (sqlite: Database.Database, rows: string) =>
    sqlite.exec(`
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, is_group, group_id, deleted_at)
      VALUES ${rows};
    `)
  const placement = (sqlite: Database.Database) =>
    sqlite.prepare('SELECT id, is_group, group_id, deleted_at FROM mockups ORDER BY id').all()

  it('takes a mockup trashed from inside a pile out of the pile, so Trash lists it on its own', () => {
    const { sqlite, migrateRest } = databaseBefore('_free_trashed_pile_members')
    insert(
      sqlite,
      `(1, 'Mug', '/l/1.psd', '/c/1.png', 'embedded', 1, NULL, NULL),
       (2, 'Mug', '/l/2.psd', '/c/2.png', 'embedded', 0, 1, '2026-10-20T10:00:00.000Z'),
       (3, 'Mug', '/l/3.psd', '/c/3.png', 'embedded', 0, 1, NULL)`
    )

    migrateRest()

    expect(placement(sqlite)).toEqual([
      { id: 1, is_group: 1, group_id: null, deleted_at: null },
      { id: 2, is_group: 0, group_id: null, deleted_at: '2026-10-20T10:00:00.000Z' },
      { id: 3, is_group: 0, group_id: 1, deleted_at: null }
    ])
  })

  it('a pile with no other mockup left stops being a pile', () => {
    const { sqlite, migrateRest } = databaseBefore('_free_trashed_pile_members')
    insert(
      sqlite,
      `(1, 'Mug', '/l/1.psd', '/c/1.png', 'embedded', 1, NULL, NULL),
       (2, 'Mug', '/l/2.psd', '/c/2.png', 'embedded', 0, 1, '2026-10-20T10:00:00.000Z')`
    )

    migrateRest()

    expect(placement(sqlite)).toEqual([
      { id: 1, is_group: 0, group_id: null, deleted_at: null },
      { id: 2, is_group: 0, group_id: null, deleted_at: '2026-10-20T10:00:00.000Z' }
    ])
  })

  it('leaves piles in Trash and their members as they are', () => {
    const { sqlite, migrateRest } = databaseBefore('_free_trashed_pile_members')
    insert(
      sqlite,
      `(1, 'Mug', '/l/1.psd', '/c/1.png', 'embedded', 1, NULL, '2026-10-20T10:00:00.000Z'),
       (2, 'Mug', '/l/2.psd', '/c/2.png', 'embedded', 0, 1, NULL),
       (3, 'Cup', '/l/3.psd', '/c/3.png', 'embedded', 1, NULL, NULL),
       (4, 'Cup', '/l/4.psd', '/c/4.png', 'embedded', 0, 3, NULL)`
    )
    const before = placement(sqlite)

    migrateRest()

    expect(placement(sqlite)).toEqual(before)
  })
})

describe('migration: AI-made tags no mockup carries (F-034)', () => {
  /** A library from before suggestions were told apart from tags. */
  const before = () => {
    const db = databaseBefore('_tag_suggestions')
    db.sqlite.exec(`
      INSERT INTO tag_categories (id, label, sort_order, is_canonical) VALUES
        (1, 'Device', 0, 1), (2, 'Colour', 1, 0), (3, 'Mood', 2, 0), (4, 'Texture', 3, 0), (5, 'Empty', 4, 0);
      INSERT INTO tags (id, label, category_id, is_canonical, created_by) VALUES
        (1, 'Laptop', 1, 1, 'seed'),
        (2, 'Beige', 2, 0, 'ai'),
        (3, 'Gradient', 2, 0, 'ai'),
        (4, 'Warm', 3, 0, 'ai'),
        (5, 'Calm', 3, 0, 'ai'),
        (6, 'Clay', 1, 1, 'user'),
        (7, 'Matte', 4, 1, 'user');
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, stage) VALUES
        (1, 'Stashed', '/l/1.psd', '/c/1.png', 'embedded', 'stashed'),
        (2, 'Waiting', '/l/2.psd', '/c/2.png', 'embedded', 'to_stash');
      INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (1, 2);
      INSERT INTO drafts (mockup_id, title, tag_ids) VALUES (2, 'Waiting', '[4]');
    `)
    return db
  }
  const tagsNow = (sqlite: Database.Database) =>
    sqlite.prepare('SELECT label, created_by AS createdBy FROM tags ORDER BY id').all()
  const categoriesNow = (sqlite: Database.Database) =>
    sqlite.prepare('SELECT label, suggestion FROM tag_categories ORDER BY id').all()

  it('removes AI-made tags at no mockups, keeps one a draft still holds as a suggestion, and keeps every tag a person made', () => {
    const { sqlite, migrateRest } = before()

    migrateRest()

    expect(tagsNow(sqlite)).toEqual([
      { label: 'Laptop', createdBy: 'seed' },
      { label: 'Beige', createdBy: 'ai' },
      { label: 'Warm', createdBy: 'suggestion' },
      { label: 'Clay', createdBy: 'user' },
      { label: 'Matte', createdBy: 'user' }
    ])
  })

  it('removes AI-made categories left with nothing in them, and marks one holding only suggestions', () => {
    const { sqlite, migrateRest } = before()

    migrateRest()

    expect(categoriesNow(sqlite)).toEqual([
      { label: 'Device', suggestion: 0 },
      { label: 'Colour', suggestion: 0 },
      { label: 'Mood', suggestion: 1 },
      { label: 'Texture', suggestion: 0 }
    ])
  })

  it('a suggestion that lands on a mockup becomes a tag, and its category with it', () => {
    const { sqlite, migrateRest } = before()
    migrateRest()

    sqlite.exec('INSERT INTO mockup_tags (mockup_id, tag_id) VALUES (2, 4)')

    expect(sqlite.prepare('SELECT created_by AS createdBy FROM tags WHERE id = 4').get()).toEqual({ createdBy: 'ai' })
    expect(sqlite.prepare('SELECT suggestion FROM tag_categories WHERE id = 3').get()).toEqual({ suggestion: 0 })
  })
})

describe('migration: where a mockup in Trash came from', () => {
  it('marks every mockup already in Trash as from My Stash, since Toss deleted for good before', () => {
    const { sqlite, migrateRest } = databaseBefore('_trash_origin')
    sqlite.exec(`
      INSERT INTO mockups (id, title, library_path, cover_path, cover_source, deleted_at) VALUES
        (1, 'Gone', '/l/1.psd', '/c/1.png', 'embedded', '2026-10-20T10:00:00.000Z'),
        (2, 'Here', '/l/2.psd', '/c/2.png', 'embedded', NULL);
    `)

    migrateRest()

    expect(sqlite.prepare('SELECT id, trash_origin FROM mockups ORDER BY id').all()).toEqual([
      { id: 1, trash_origin: 'my-stash' },
      { id: 2, trash_origin: null }
    ])
  })
})

describe('migration: retire the haul state undone', () => {
  it('marks a haul undone before the app history as done, and leaves every other haul alone', () => {
    const { sqlite, migrateRest } = databaseBefore('_retire_undone_haul')
    sqlite.exec(`
      INSERT INTO copy_hauls (id, state, pause_reason) VALUES
        ('a', 'undone', NULL),
        ('b', 'cancelled', NULL),
        ('c', 'paused', 'disk-full'),
        ('d', 'done', NULL);
    `)

    migrateRest()

    expect(sqlite.prepare('SELECT id, state, pause_reason FROM copy_hauls ORDER BY id').all()).toEqual([
      { id: 'a', state: 'done', pause_reason: null },
      { id: 'b', state: 'cancelled', pause_reason: null },
      { id: 'c', state: 'paused', pause_reason: 'disk-full' },
      { id: 'd', state: 'done', pause_reason: null }
    ])
  })
})
