import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { createTestDb, sample } from './__tests__/setup'
import { ftsMatchQuery } from './search'

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

describe('ftsMatchQuery', () => {
  it('prefix-matches every word', () => {
    expect(ftsMatchQuery('tote bag')).toBe('tote* bag*')
  })

  it('keeps letters, digits and underscores, and drops the rest', () => {
    expect(ftsMatchQuery('  café  "poster"! 3D_render ')).toBe('caf* poster* 3D_render*')
  })

  it('searches a hyphenated word as a phrase, the way the index splits it', () => {
    expect(ftsMatchQuery('t-shirt')).toBe('"t shirt"*')
    expect(ftsMatchQuery('z-fold brochure')).toBe('"z fold"* brochure*')
    expect(ftsMatchQuery('-flat- lay')).toBe('flat* lay*')
  })

  it('folds a plural to its singular, so "bags" also finds a stored "bag"', () => {
    expect(ftsMatchQuery('tote bags')).toBe('tote* bag*')
    expect(ftsMatchQuery('boxes brushes glasses')).toBe('box* brush* glass*')
    expect(ftsMatchQuery('stationeries iPhones')).toBe('stationery* iPhone*')
    expect(ftsMatchQuery('t-shirts')).toBe('"t shirt"*')
  })

  it('leaves short words and -ss words as typed', () => {
    expect(ftsMatchQuery('bus gas glass dress')).toBe('bus* gas* glass* dress*')
  })

  it('is null when nothing searchable is left', () => {
    expect(ftsMatchQuery('')).toBeNull()
    expect(ftsMatchQuery('  ! ? ')).toBeNull()
  })

  it('is what rankMatches searches with', () => {
    ensureSearchIndex(db)
    const m = repo.mockups.createMockup({
      ...sample,
      title: 'Tote Bag Hero',
      libraryPath: '/lib/fts/q.psd'
    })
    repo.mockups.setStage([m.id], 'stashed')
    repo.search.upsertSearchIndex(m.id)

    expect([...(repo.search.rankMatches('tote ba') ?? new Map()).keys()]).toEqual([m.id])
    expect(repo.search.rankMatches('!!')).toBeNull()
  })

  it('finds a T-shirt by "t-shirt" and "t-shirts", and a tote bag by "bags", without matching others', () => {
    ensureSearchIndex(db)
    seedTaxonomy(db)
    const shirt = repo.mockups.createMockup({ ...sample, title: 'Folded shirt', libraryPath: '/lib/fts/s.psd' })
    const bag = repo.mockups.createMockup({ ...sample, title: 'Tote bag on a chair', libraryPath: '/lib/fts/t.psd' })
    const tee = repo.tags.getAllTags().find((t) => t.label === 'T-shirt')!
    repo.mockups.addTagToMockup(shirt.id, tee.id)
    for (const m of [shirt, bag]) {
      repo.mockups.setStage([m.id], 'stashed')
      repo.search.upsertSearchIndex(m.id)
    }
    const ids = (q: string) => [...(repo.search.rankMatches(q) ?? new Map()).keys()]

    expect(ids('t-shirt')).toEqual([shirt.id])
    expect(ids('t-shirts')).toEqual([shirt.id])
    expect(ids('bags')).toEqual([bag.id])
  })
})
