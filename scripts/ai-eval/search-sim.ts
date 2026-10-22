import { DatabaseSync } from 'node:sqlite'
import { FTS_WEIGHTS, ftsMatchQuery } from '../../src/main/db/repositories/search'
import { searchKeywords } from '../../src/main/db/search-keywords'
import { nameKeywords } from '../../src/main/db/search-names'
import { tagsColumn, type TagPair } from './searchable-tags'

export interface IndexedItem {
  id: string
  title: string
  description: string
  tags: TagPair[]
  /** The original file name and folders, for the hidden name words. */
  fileName?: string
  folderTrail?: string[]
  /** Searchable but not shown: appended to the tags column text. */
  keywords?: string[]
}

/** The tags column of a row: the tag labels, then any keywords, joined by spaces. */
export function tagsColumnText(item: Pick<IndexedItem, 'tags' | 'keywords'>): string {
  return [tagsColumn(item.tags), ...(item.keywords ?? [])].filter((t) => t.trim()).join(' ')
}

/**
 * The app's search over a set of items: the same `mockups_fts` layout as `search-index.ts`, rows
 * written as `SearchRepository.upsertSearchIndex` writes them (plus a version's keywords), the MATCH built by `ftsMatchQuery`
 * and results in FTS rank order, as the library sorts them. In memory with `node:sqlite`, so no
 * native module has to be rebuilt.
 */
export class SearchSim {
  private readonly db = new DatabaseSync(':memory:')
  private readonly ids: string[] = []

  constructor(items: IndexedItem[], options: { synonyms?: boolean; names?: boolean; stem?: boolean } = {}) {
    const synonyms = options.synonyms ?? true
    const names = options.names ?? true
    const tokenize = options.stem ? ", tokenize='porter unicode61'" : ''
    this.db.exec(
      `CREATE VIRTUAL TABLE mockups_fts USING fts5(title, description, tags, keywords${tokenize})`
    )
    const insert = this.db.prepare(
      'INSERT INTO mockups_fts(rowid, title, description, tags, keywords) VALUES (?, ?, ?, ?, ?)'
    )
    items.forEach((item, i) => {
      this.ids.push(item.id)
      const nameWords = names && item.fileName ? nameKeywords(item.fileName, item.folderTrail ?? []) : []
      const hidden = (
        synonyms
          ? searchKeywords(
              item.title,
              item.description,
              item.tags.map((t) => t.label),
              nameWords
            )
          : nameWords
      ).join(' ')
      insert.run(i + 1, item.title, item.description, tagsColumnText(item), hidden)
    })
  }

  /** Ids best first. A query with no searchable words returns nothing; an FTS error is passed back. */
  search(query: string): { ids: string[]; error?: string } {
    const match = ftsMatchQuery(query)
    if (!match) return { ids: [] }
    try {
      const rows = this.db
        .prepare(
          `SELECT rowid, bm25(mockups_fts, ${FTS_WEIGHTS.join(', ')}) AS rank
           FROM mockups_fts WHERE mockups_fts MATCH ? ORDER BY rank, rowid`
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
