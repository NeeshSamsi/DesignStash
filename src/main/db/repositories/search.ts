import { and, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, tags, mockupTags } from '../schema'

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
      .where(and(eq(mockups.reviewStatus, 'approved'), isNull(mockups.deletedAt)))
      .all()
    for (const m of rows) this.upsertSearchIndex(m.id)
  }

  /**
   * Prefix-match a free-text query. Returns mockup id → FTS rank, or null when the query
   * has no searchable terms (so the caller skips the filter).
   */
  rankMatches(query: string): Map<number, number> | null {
    const ftsTerms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[^a-zA-Z0-9\-_]/g, '') + '*')
      .filter((t) => t.length > 1)
      .join(' ')
    if (!ftsTerms) return null
    const ftsRows = this.db.all<{ rowid: number; rank: number }>(
      sql`SELECT rowid, rank FROM mockups_fts WHERE mockups_fts MATCH ${ftsTerms}`
    )
    return new Map(ftsRows.map((r) => [r.rowid, r.rank]))
  }
}
