import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

let sqlite: Database.Database | null = null
let db: AppDatabase | null = null

export function initDb(dbPath: string): AppDatabase {
  if (db) return db

  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  return db
}

export function getDb(): AppDatabase {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

/** Raw better-sqlite3 handle, for the rare low-level need (e.g. PRAGMA, FTS). */
export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not initialized. Call initDb() first.')
  return sqlite
}

export function closeDb(): void {
  sqlite?.close()
  sqlite = null
  db = null
}
