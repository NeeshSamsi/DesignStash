import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import type { LibraryRow } from './library-query'
import { approvedMockup, createTestDb } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
  seedTaxonomy(db)
  ensureSearchIndex(db)
})

afterEach(() => sqlite.close())

/** 50 mockups: tags added out of order, a few piles, one pile with a trashed member. */
function seed(): number[] {
  const tagIds = repo.getAllTags().map((t) => t.id)
  const ids: number[] = []
  for (let i = 0; i < 50; i++) {
    const m = repo.createMockup(approvedMockup({ title: `M${i}`, libraryPath: `/lib/lk${i}.psd` }))
    ids.push(m.id)
    // Highest tag first, so insertion order differs from tag id order.
    const picked = [tagIds[(i * 3) % tagIds.length]!, tagIds[i % 2]!, tagIds[(i + 5) % tagIds.length]!]
    for (const tagId of [...new Set(picked)].sort((a, b) => b - a)) repo.addTagToMockup(m.id, tagId)
  }
  repo.createPile([ids[0]!, ids[1]!, ids[2]!], ids[0]!)
  repo.createPile([ids[10]!, ids[11]!], ids[10]!)
  repo.moveToTrash(ids[11]!)
  return ids
}

/** The rows as the per-row queries built them before the batched lookups. */
function referenceRows(ids: number[]): LibraryRow[] {
  const categories = new Map(repo.getAllCategories().map((c) => [c.id, c.label]))
  return ids.map((id) => {
    const m = repo.getMockup(id)!
    return {
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      coverPath: m.coverPath,
      coverSource: m.coverSource,
      coverMissing: true,
      isGroup: m.isGroup,
      favourite: m.favourite,
      reviewStatus: m.reviewStatus,
      createdAt: m.createdAt,
      variantCount: repo.getMockupsByGroupId(m.id).length,
      topId: m.isGroup ? m.id : null,
      tags: repo.getTagsForMockup(m.id).map((t) => ({
        id: t.id,
        label: t.label,
        categoryLabel: categories.get(t.categoryId) ?? ''
      }))
    }
  })
}

describe('batched row lookups', () => {
  it('builds the same rows as the per-row queries, tag order and variantCount included', () => {
    const ids = seed()
    expect(repo.library.toRows(ids.map((id) => repo.getMockup(id)!))).toEqual(referenceRows(ids))
  })

  it('gives getTrashEntries the same ids and rows as before', () => {
    const ids = seed()
    repo.moveToTrash(ids[0]!)
    const entries = repo.getTrashEntries()
    const top = entries.find((e) => e.row.id === ids[0])!
    expect(top.ids).toEqual([ids[0], ...repo.getMockupsByGroupId(ids[0]!).map((m) => m.id)])
    expect(top.row).toEqual(referenceRows([ids[0]!])[0])
  })

  it('reads tags and members in two queries for 50 rows', () => {
    seed()
    const list = repo.getLibrary({ sort: 'date' }).map((r) => repo.getMockup(r.id)!)
    expect(list.length).toBeGreaterThan(40)
    const prepare = vi.spyOn(sqlite, 'prepare')
    repo.library.toRows(list)
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('answers getLibrary with a handful of queries, whatever the row count', () => {
    seed()
    const [laptop] = repo.getAllTags()
    const prepare = vi.spyOn(sqlite, 'prepare')
    repo.getLibrary({ sort: 'date', tagIds: [laptop!.id] })
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(4)
  })
})
