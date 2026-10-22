import type { AppDatabase } from './connection'
import { sql } from 'drizzle-orm'

/** Creates the FTS5 search index if absent. better-sqlite3 ships with FTS5.
 *  Standalone (managed) FTS table keyed by rowid = mockups.id. Repository maintains rows explicitly. */
export function ensureSearchIndex(db: AppDatabase): void {
  db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS mockups_fts USING fts5(title, description, tags, keywords)`)
}
