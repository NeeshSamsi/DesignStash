import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, tags, mockupTags } from '../schema'
import { isStashed } from './stashed'
import { searchKeywords } from '../search-keywords'
import { nameKeywords } from '../search-names'
import { meaningDocument } from '../../search/meaning'
import { fullTitle } from '@shared/pile-variation'
import type { Mockup } from '../schema'

/** What search knows a mockup by: its full title, `base · variation` in a pile. */
const searchTitle = (m: Pick<Mockup, 'title' | 'variation'>) => fullTitle(m.title, m.variation ? { words: m.variation } : null)

/**
 * An English plural folded to its singular ("bags" → "bag", "boxes" → "box", "stationeries" →
 * "stationery"). The index has no stemming, and the prefix match already lets "bag" find "bags", so
 * this is what lets "bags" find "bag". Words under four letters and -ss words are left alone.
 */
export function singular(word: string): string {
  if (word.length < 4 || /ss$/i.test(word)) return word
  if (/ies$/i.test(word)) return word.slice(0, -3) + 'y'
  if (/(x|z|ch|sh|ss)es$/i.test(word)) return word.slice(0, -2)
  if (/s$/i.test(word)) return word.slice(0, -1)
  return word
}

/**
 * One typed word as an FTS5 term, prefix-matched. A hyphenated word ("t-shirt") becomes a phrase,
 * since the index splits it at the hyphen and a bare hyphen is FTS5 syntax. A plural is also
 * folded to its singular; when that fold does not start the typed word ("fries" to "fry"), either
 * form matches, so "fries" still finds "fries". Null when nothing is left.
 */
function ftsTerm(word: string): string | null {
  const parts = word
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .split('-')
    .filter(Boolean)
  if (parts.length === 0) return null
  const typed = parts[parts.length - 1]!
  const folded = singular(typed)
  const term = (last: string): string => {
    const all = [...parts.slice(0, -1), last]
    return all.length === 1 ? `${all[0]}*` : `"${all.join(' ')}"*`
  }
  if (typed.toLowerCase().startsWith(folded.toLowerCase())) return term(folded)
  return `(${term(typed)} OR ${term(folded)})`
}

/** Little words that say nothing in a search ("mug on a table"). */
const FILLER = new Set(['on', 'in', 'with', 'the', 'a', 'and', 'of', 'for', 'at'])

/**
 * The FTS5 MATCH expression for a free-text query: each word prefix-matched, with everything but
 * letters, digits, hyphens and underscores dropped, and filler words left out unless the query is
 * only filler. Null when no word is left.
 */
export function ftsMatchQuery(query: string): string | null {
  const words = query.split(/\s+/).filter(Boolean)
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()))
  const terms = (meaningful.length > 0 ? meaningful : words)
    .map(ftsTerm)
    .filter((t): t is string => t !== null)
    .join(' ')
  return terms || null
}

/**
 * bm25 column weights: title, description, tags, keywords. A word that only the hidden keywords
 * carry counts for a quarter of one the person can see, so direct hits rank above keyword-only hits.
 */
export const FTS_WEIGHTS = [1, 1, 1, 0.25] as const

/** The mockups_fts index: title, description, tag labels and hidden keywords of approved mockups. */
export class SearchRepository {
  private indexListener: ((mockupId: number, meaningText: string) => void) | null = null

  constructor(private readonly db: AppDatabase) {}

  /** Told the text to embed whenever a mockup is indexed, so meaning search can keep its vectors current. */
  setIndexListener(listener: ((mockupId: number, meaningText: string) => void) | null): void {
    this.indexListener = listener
  }

  private tagLabelsOf(mockupId: number): string[] {
    return this.db
      .select()
      .from(tags)
      .innerJoin(mockupTags, eq(tags.id, mockupTags.tagId))
      .where(eq(mockupTags.mockupId, mockupId))
      .all()
      .map((row) => row.tags.label)
  }

  /** The text meaning search embeds for every stashed, non-trashed mockup. */
  meaningDocuments(): { id: number; text: string }[] {
    return this.db
      .select()
      .from(mockups)
      .where(and(isStashed, isNull(mockups.deletedAt)))
      .all()
      .map((m) => ({ id: m.id, text: meaningDocument(searchTitle(m), m.description, this.tagLabelsOf(m.id)) }))
  }

  upsertSearchIndex(mockupId: number): void {
    const m = this.db.select().from(mockups).where(eq(mockups.id, mockupId)).get()
    if (!m) return
    const tagLabels = this.tagLabelsOf(mockupId)
    const ctx = m.importContext as { folderTrail?: string[]; originalFilename?: string } | null
    const names = ctx?.originalFilename
      ? nameKeywords(ctx.originalFilename, ctx.folderTrail ?? [])
      : []
    const title = searchTitle(m)
    const keywords = searchKeywords(title, m.description ?? '', tagLabels, names).join(' ')
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
    this.db.run(
      sql`INSERT INTO mockups_fts(rowid, title, description, tags, keywords)
          VALUES (${mockupId}, ${title}, ${m.description ?? ''}, ${tagLabels.join(' ')}, ${keywords})`
    )
    this.indexListener?.(mockupId, meaningDocument(title, m.description, tagLabels))
  }

  /** Whether the mockup is in the index (stashed and not in Trash). */
  isIndexed(mockupId: number): boolean {
    return (
      this.db.get<{ n: number }>(sql`SELECT 1 AS n FROM mockups_fts WHERE rowid = ${mockupId}`) !==
      undefined
    )
  }

  /** Takes a mockup out of search: its keyword row and its meaning vectors. */
  removeSearchIndex(mockupId: number): void {
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
    this.db.run(sql`DELETE FROM mockup_embeddings WHERE mockup_id = ${mockupId}`)
  }

  rebuildSearchIndex(): void {
    this.db.run(sql`DELETE FROM mockups_fts`)
    const rows = this.db
      .select()
      .from(mockups)
      .where(and(isStashed, isNull(mockups.deletedAt)))
      .all()
    for (const m of rows) this.upsertSearchIndex(m.id)
    // Vectors of mockups that are no longer in the index (trashed, unstashed) go too.
    this.db.run(sql`DELETE FROM mockup_embeddings WHERE mockup_id NOT IN (SELECT rowid FROM mockups_fts)`)
  }

  /**
   * Prefix-match a free-text query. Returns mockup id → weighted bm25 rank (lower is better), or null when the query
   * has no searchable terms (so the caller skips the filter).
   */
  rankMatches(query: string): Map<number, number> | null {
    const ftsTerms = ftsMatchQuery(query)
    if (!ftsTerms) return null
    const ftsRows = this.db.all<{ rowid: number; rank: number }>(
      sql`SELECT rowid, bm25(mockups_fts, ${sql.raw(FTS_WEIGHTS.join(', '))}) AS rank
          FROM mockups_fts WHERE mockups_fts MATCH ${ftsTerms}`
    )
    return new Map(ftsRows.map((r) => [r.rowid, r.rank]))
  }
}
