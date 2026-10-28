import type Database from 'better-sqlite3'

/**
 * Bump when the words the keyword index keeps for a mockup change (`searchTitle`, `searchKeywords`,
 * `nameKeywords`), so every library rebuilds its index once on its next launch. 2: name words read
 * lookalike letters as Latin (H-4).
 */
export const SEARCH_INDEX_VERSION = 2

/**
 * Bump when the rules that make a pile's titles whole change (`PileTitles.fill` and `leave`), so
 * every library settles its piles once on its next launch.
 */
export const PILE_TITLES_VERSION = 1

export interface UpkeepSteps {
  /** Every pile's titles made whole (`PileTitles.settleAll`). */
  settlePileTitles(): void
  /** The keyword index emptied and written again (`SearchRepository.rebuildSearchIndex`). */
  rebuildSearchIndex(): void
}

/** Both versions and the migration count in one number, kept in the database's `user_version`. */
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
  return (PILE_TITLES_VERSION * 100 + SEARCH_INDEX_VERSION) * 10_000 + migrations
}

/**
 * Launch work that only has to run when the code or the schema changed: every pile's titles made
 * whole, then the keyword index rebuilt. Every write keeps both in step, so a launch whose stamp
 * matches the database's skips both. When they run it is in one transaction: one commit for the
 * lot, and a rebuild that fails part-way leaves the old index and the old stamp. A settle that
 * fails goes to `onError` and is rolled back on its own; the index still rebuilds, and the stamp
 * stays old so both run again next launch. Returns whether they ran.
 */
export function runLaunchUpkeep(
  sqlite: Database.Database,
  steps: UpkeepSteps,
  onError: (err: unknown) => void = () => {}
): boolean {
  const stamp = stampOf(sqlite)
  if (sqlite.pragma('user_version', { simple: true }) === stamp) return false
  sqlite.transaction(() => {
    let settled = true
    try {
      sqlite.transaction(() => steps.settlePileTitles())()
    } catch (err) {
      settled = false
      onError(err)
    }
    steps.rebuildSearchIndex()
    if (settled) sqlite.pragma(`user_version = ${stamp}`)
  })()
  return true
}
