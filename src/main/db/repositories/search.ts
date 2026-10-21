import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, tags, mockupTags } from '../schema'
import { isStashed } from './stashed'

/**
 * An English plural folded to its singular ("bags" → "bag", "boxes" → "box", "stationeries" →
 * "stationery"). The index has no stemming, and the prefix match already lets "bag" find "bags", so
 * this is what lets "bags" find "bag". Words under four letters and -ss words are left alone.
 */
function singular(word: string): string {
  if (word.length < 4 || /ss$/i.test(word)) return word
  if (/ies$/i.test(word)) return word.slice(0, -3) + 'y'
  if (/(x|z|ch|sh|ss)es$/i.test(word)) return word.slice(0, -2)
  if (/s$/i.test(word)) return word.slice(0, -1)
  return word
}

/**
 * One typed word as an FTS5 term, prefix-matched. A hyphenated word ("t-shirt") becomes a phrase,
 * since the index splits it at the hyphen and a bare hyphen is FTS5 syntax. Null when nothing is left.
 */
function ftsTerm(word: string): string | null {
  const parts = word
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .split('-')
    .filter(Boolean)
  const last = parts.length - 1
  if (last >= 0) parts[last] = singular(parts[last]!)
  if (parts.length === 0) return null
  return parts.length === 1 ? `${parts[0]}*` : `"${parts.join(' ')}"*`
}

/**
 * The FTS5 MATCH expression for a free-text query: each word prefix-matched, with everything but
 * letters, digits, hyphens and underscores dropped. Null when no word is left.
 */
export function ftsMatchQuery(query: string): string | null {
  const terms = query
    .split(/\s+/)
    .map(ftsTerm)
    .filter((t): t is string => t !== null)
    .join(' ')
  return terms || null
}

/** The mockups_fts index: title, description and tag labels of approved mockups. */
export class SearchRepository {
  constructor(private readonly db: AppDatabase) {}

  upsertSearchIndex(mockupId: number): void {
    const m = this.db.select().from(mockups).where(eq(mockups.id, mockupId)).get()
    if (!m) return
    const tagLabels = this.db
      .select()
      .from(tags)
      .innerJoin(mockupTags, eq(tags.id, mockupTags.tagId))
      .where(eq(mockupTags.mockupId, mockupId))
      .all()
      .map((row) => row.tags.label)
      .join(' ')
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
    this.db.run(
      sql`INSERT INTO mockups_fts(rowid, title, description, tags)
          VALUES (${mockupId}, ${m.title}, ${m.description ?? ''}, ${tagLabels})`
    )
  }

  removeSearchIndex(mockupId: number): void {
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
  }

  rebuildSearchIndex(): void {
    this.db.run(sql`DELETE FROM mockups_fts`)
    const rows = this.db
      .select()
      .from(mockups)
      .where(and(isStashed, isNull(mockups.deletedAt)))
      .all()
    for (const m of rows) this.upsertSearchIndex(m.id)
  }

  /**
   * Prefix-match a free-text query. Returns mockup id → FTS rank, or null when the query
   * has no searchable terms (so the caller skips the filter).
   */
  rankMatches(query: string): Map<number, number> | null {
    const ftsTerms = ftsMatchQuery(query)
    if (!ftsTerms) return null
    const ftsRows = this.db.all<{ rowid: number; rank: number }>(
      sql`SELECT rowid, rank FROM mockups_fts WHERE mockups_fts MATCH ${ftsTerms}`
    )
    return new Map(ftsRows.map((r) => [r.rowid, r.rank]))
  }
}
