import { DatabaseSync } from 'node:sqlite'
import { ftsMatchQuery } from '../../src/main/db/repositories/search'
import { tagsColumn, type TagPair } from './searchable-tags'

export interface IndexedItem {
  id: string
  title: string
  description: string
  tags: TagPair[]
}

/**
 * The app's search over a set of items: the same `mockups_fts` layout as `search-index.ts`, rows
 * written as `SearchRepository.upsertSearchIndex` writes them, the MATCH built by `ftsMatchQuery`
 * and results in FTS rank order, as the library sorts them. In memory with `node:sqlite`, so no
 * native module has to be rebuilt.
 */
export class SearchSim {
  private readonly db = new DatabaseSync(':memory:')
  private readonly ids: string[] = []

  constructor(items: IndexedItem[]) {
    this.db.exec('CREATE VIRTUAL TABLE mockups_fts USING fts5(title, description, tags)')
    const insert = this.db.prepare(
      'INSERT INTO mockups_fts(rowid, title, description, tags) VALUES (?, ?, ?, ?)'
    )
    items.forEach((item, i) => {
      this.ids.push(item.id)
      insert.run(i + 1, item.title, item.description, tagsColumn(item.tags))
    })
  }

  /** Ids best first. A query with no searchable words returns nothing; an FTS error is passed back. */
  search(query: string): { ids: string[]; error?: string } {
    const match = ftsMatchQuery(query)
    if (!match) return { ids: [] }
    try {
      const rows = this.db
        .prepare(
          'SELECT rowid, rank FROM mockups_fts WHERE mockups_fts MATCH ? ORDER BY rank, rowid'
        )
        .all(match) as { rowid: number; rank: number }[]
      return { ids: rows.map((r) => this.ids[r.rowid - 1]!) }
    } catch (err) {
      return { ids: [], error: err instanceof Error ? err.message : String(err) }
    }
  }

  close(): void {
    this.db.close()
  }
}
