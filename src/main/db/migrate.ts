import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { AppDatabase } from './connection'

/**
 * Apply pending Drizzle migrations from a generated migrations folder.
 * `drizzle-kit generate` writes SQL + journal into ./drizzle.
 */
export function runMigrations(db: AppDatabase, migrationsFolder: string): void {
  migrate(db, { migrationsFolder })
}
