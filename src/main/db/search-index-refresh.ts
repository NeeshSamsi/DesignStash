import type Database from 'better-sqlite3'

/**
 * Bump when the words the keyword index keeps for a mockup change (`searchTitle`, `searchKeywords`,
 * `nameKeywords`), so every library rebuilds its index once on its next launch.
 */
export const SEARCH_INDEX_VERSION = 1

/** Index version and migration count in one number, kept in the database's `user_version`. */
function stampOf(sqlite: Database.Database): number {
  let migrations = 0
  try {
    const row = sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as
      | { n: number }
      | undefined
    migrations = row?.n ?? 0
  } catch {
    // No migrations table yet: the stamp still changes once one is there.
  }
  return SEARCH_INDEX_VERSION * 10_000 + migrations
}

/**
 * Every write keeps the keyword index in step, so launch only rebuilds it when the index code or
 * the schema changed since the last rebuild. The rebuild runs in one transaction: one commit
 * instead of one per row, and a failure part-way leaves the old index and the old stamp.
 * Returns whether it rebuilt.
 */
export function refreshSearchIndex(sqlite: Database.Database, rebuild: () => void): boolean {
  const stamp = stampOf(sqlite)
  if (sqlite.pragma('user_version', { simple: true }) === stamp) return false
  sqlite.transaction(() => {
    rebuild()
    sqlite.pragma(`user_version = ${stamp}`)
  })()
  return true
}
