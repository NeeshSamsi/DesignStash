import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
})

afterEach(() => sqlite.close())

describe('search index', () => {
  beforeEach(() => ensureSearchIndex(db))

  const matchFts = (query: string): number[] => {
    return (
      sqlite.prepare(`SELECT rowid FROM mockups_fts WHERE mockups_fts MATCH ?`).all(query) as {
        rowid: number
      }[]
    ).map((r) => r.rowid)
  }

  it('upsertSearchIndex makes mockup findable by title and tag', () => {
    const m = repo.mockups.createMockup({ ...sample, title: 'MacBook Hero', libraryPath: '/lib/fts/a.psd' })
    repo.mockups.setStage([m.id], 'stashed')
    seedTaxonomy(db)
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    repo.mockups.addTagToMockup(m.id, laptop.id)

    repo.search.upsertSearchIndex(m.id)

    expect(matchFts('MacBook')).toContain(m.id)
    expect(matchFts('laptop')).toContain(m.id)
  })

  it('removeSearchIndex removes mockup from FTS', () => {
    const m = repo.mockups.createMockup({ ...sample, title: 'Remove Me', libraryPath: '/lib/fts/b.psd' })
    repo.search.upsertSearchIndex(m.id)
    expect(matchFts('Remove')).toContain(m.id)

    repo.search.removeSearchIndex(m.id)
    expect(matchFts('Remove')).not.toContain(m.id)
  })

  it('rebuildSearchIndex indexes by stage', () => {
    const waiting = repo.mockups.createMockup({
      ...sample,
      title: 'Waiting Approved',
      libraryPath: '/lib/fts/f.psd',
      stage: 'to_stash'
    })
    const stashed = repo.mockups.createMockup({
      ...sample,
      title: 'Stashed Pending',
      libraryPath: '/lib/fts/g.psd',
      stage: 'stashed'
    })
    repo.search.rebuildSearchIndex()
    expect(matchFts('Waiting')).not.toContain(waiting.id)
    expect(matchFts('Stashed')).toContain(stashed.id)
  })

  it('rebuildSearchIndex indexes only approved non-deleted mockups', () => {
    const approved = repo.mockups.createMockup({
      ...sample,
      title: 'Approved One',
      libraryPath: '/lib/fts/c.psd'
    })
    repo.mockups.setStage([approved.id], 'stashed')

    const pending = repo.mockups.createMockup({
      ...sample,
      title: 'Pending One',
      libraryPath: '/lib/fts/d.psd'
    })

    const deleted = repo.mockups.createMockup({
      ...sample,
      title: 'Deleted One',
      libraryPath: '/lib/fts/e.psd'
    })
    repo.mockups.setStage([deleted.id], 'stashed')
    repo.mockups.updateMockup(deleted.id, { deletedAt: new Date().toISOString() })

    repo.search.rebuildSearchIndex()

    expect(matchFts('Approved')).toContain(approved.id)
    expect(matchFts('Pending')).not.toContain(pending.id)
    expect(matchFts('Deleted')).not.toContain(deleted.id)
  })
})
