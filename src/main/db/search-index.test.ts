import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { ensureSearchIndex } from './search-index'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
})

afterEach(() => sqlite.close())

describe('ensureSearchIndex', () => {
  it('creates mockups_fts without error', () => {
    expect(() => ensureSearchIndex(db)).not.toThrow()
  })

  it('is idempotent — calling twice does not throw', () => {
    ensureSearchIndex(db)
    expect(() => ensureSearchIndex(db)).not.toThrow()
  })

  it('supports FTS5 MATCH queries after creation', () => {
    ensureSearchIndex(db)
    sqlite
      .prepare('INSERT INTO mockups_fts(rowid, title, description, tags) VALUES (?, ?, ?, ?)')
      .run(1, 'MacBook Hero', 'desc', 'laptop macbook')

    const rows = sqlite
      .prepare("SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH 'macbook'")
      .all() as { rowid: number }[]

    expect(rows).toHaveLength(1)
    expect(rows[0]!.rowid).toBe(1)
  })

  it('does not match unrelated rows', () => {
    ensureSearchIndex(db)
    sqlite
      .prepare('INSERT INTO mockups_fts(rowid, title, description, tags) VALUES (?, ?, ?, ?)')
      .run(1, 'iPhone Hero', 'desc', 'phone iphone')

    const rows = sqlite
      .prepare("SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH 'macbook'")
      .all()

    expect(rows).toHaveLength(0)
  })
})
