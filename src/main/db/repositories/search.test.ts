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
    const m = repo.createMockup({ ...sample, title: 'MacBook Hero', libraryPath: '/lib/fts/a.psd' })
    repo.approveItem(m.id, {
      title: 'MacBook Hero',
      description: 'great mockup',
      coverPath: '/c.png',
      coverSource: 'embedded',
      reviewStatus: 'approved'
    })
    seedTaxonomy(db)
    const laptop = repo.getAllTags().find((t) => t.label === 'Laptop')!
    repo.addTagToMockup(m.id, laptop.id)

    repo.upsertSearchIndex(m.id)

    expect(matchFts('MacBook')).toContain(m.id)
    expect(matchFts('laptop')).toContain(m.id)
  })

  it('removeSearchIndex removes mockup from FTS', () => {
    const m = repo.createMockup({ ...sample, title: 'Remove Me', libraryPath: '/lib/fts/b.psd' })
    repo.upsertSearchIndex(m.id)
    expect(matchFts('Remove')).toContain(m.id)

    repo.removeSearchIndex(m.id)
    expect(matchFts('Remove')).not.toContain(m.id)
  })

  it('rebuildSearchIndex indexes only approved non-deleted mockups', () => {
    const approved = repo.createMockup({
      ...sample,
      title: 'Approved One',
      libraryPath: '/lib/fts/c.psd'
    })
    repo.approveItem(approved.id, {
      title: 'Approved One',
      description: '',
      coverPath: '/c.png',
      coverSource: 'embedded',
      reviewStatus: 'approved'
    })

    const pending = repo.createMockup({
      ...sample,
      title: 'Pending One',
      libraryPath: '/lib/fts/d.psd'
    })

    const deleted = repo.createMockup({
      ...sample,
      title: 'Deleted One',
      libraryPath: '/lib/fts/e.psd'
    })
    repo.approveItem(deleted.id, {
      title: 'Deleted One',
      description: '',
      coverPath: '/c.png',
      coverSource: 'embedded',
      reviewStatus: 'approved'
    })
    repo.updateMockup(deleted.id, { deletedAt: new Date().toISOString() })

    repo.rebuildSearchIndex()

    expect(matchFts('Approved')).toContain(approved.id)
    expect(matchFts('Pending')).not.toContain(pending.id)
    expect(matchFts('Deleted')).not.toContain(deleted.id)
  })
})
