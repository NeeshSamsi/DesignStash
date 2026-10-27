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

describe('keyword search', () => {
  it('finds a mockup by a word only the hidden keywords carry, below a direct hit', () => {
    const tote = repo.mockups.createMockup({
      ...sample,
      title: 'Canvas tote bag',
      libraryPath: '/lib/fts/k1.psd',
      stage: 'stashed'
    })
    const direct = repo.mockups.createMockup({
      ...sample,
      title: 'Shopping bag on a table',
      libraryPath: '/lib/fts/k2.psd',
      stage: 'stashed'
    })
    repo.search.rebuildSearchIndex()

    const ranks = repo.search.rankMatches('shopping bag')!
    expect([...ranks.keys()].sort()).toEqual([tote.id, direct.id].sort())
    expect(ranks.get(direct.id)!).toBeLessThan(ranks.get(tote.id)!)
    // The keyword is hidden: the title column does not carry it.
    const row = sqlite
      .prepare('SELECT title, keywords FROM mockups_fts WHERE rowid = ?')
      .get(tote.id) as { title: string; keywords: string }
    expect(row.title).toBe('Canvas tote bag')
    expect(row.keywords).toContain('shopping bag')
  })
})

describe('plural search', () => {
  it('finds "golden fries" by "fries", and "bag" by "bags"', () => {
    const fries = repo.mockups.createMockup({
      ...sample,
      title: 'Takeaway tray',
      description: 'A tray of golden fries',
      libraryPath: '/lib/fts/p1.psd',
      stage: 'stashed'
    })
    const bag = repo.mockups.createMockup({
      ...sample,
      title: 'Paper bag',
      libraryPath: '/lib/fts/p2.psd',
      stage: 'stashed'
    })
    repo.search.rebuildSearchIndex()
    expect(repo.search.rankMatches('fries')!.has(fries.id)).toBe(true)
    expect(repo.search.rankMatches('fry')!.has(fries.id)).toBe(false)
    expect(repo.search.rankMatches('bags')!.has(bag.id)).toBe(true)
  })
})

describe('name search', () => {
  it('finds a mockup by a word only its file or folder name has', () => {
    const m = repo.mockups.createMockup({
      ...sample,
      title: 'Poster on a glass shelter',
      libraryPath: '/lib/fts/n1.psd',
      stage: 'stashed',
      importContext: {
        batchId: 'b',
        folderTrail: ['MDU089_Bus_Stop_Citylight_Mockup'],
        originalFilename: 'Poster_Mockup_63db6f047a0e4b24dc6be794.psd'
      }
    })
    repo.search.rebuildSearchIndex()
    expect(repo.search.rankMatches('citylight')!.has(m.id)).toBe(true)
    // A phrase made of two name words matches.
    expect(repo.search.rankMatches('bus stop')!.has(m.id)).toBe(true)
    // Ids and hashes are not words.
    expect(repo.search.rankMatches('63db6f047a0e4b24dc6be794')?.has(m.id) ?? false).toBe(false)
    expect(repo.search.rankMatches('mockup')?.has(m.id) ?? false).toBe(false)
  })
})

describe('ftsMatchQuery', () => {
  it('leaves filler words out unless the query is only filler', () => {
    expect(ftsMatchQuery('mug on a table')).toBe('mug* table*')
    expect(ftsMatchQuery('Bag with the Logo')).toBe('Bag* Logo*')
    expect(ftsMatchQuery('the')).toBe('the*')
    expect(ftsMatchQuery('of the')).toBe('of* the*')
  })

  it('prefix-matches every word', () => {
    expect(ftsMatchQuery('tote bag')).toBe('tote* bag*')
  })

  it('keeps letters, digits and underscores, and drops the rest', () => {
    expect(ftsMatchQuery('  café  "poster"! 3D_render ')).toBe('café* poster* 3D_render*')
  })

  it('keeps letters from every script, accents and all', () => {
    expect(ftsMatchQuery('日本')).toBe('日本*')
    expect(ftsMatchQuery('Ünal')).toBe('Ünal*')
    expect(ftsMatchQuery('हिंदी')).toBe('हिंदी*')
  })

  it('finds a word in any script, and an accented word without its look-alikes', () => {
    ensureSearchIndex(db)
    const make = (title: string, path: string) => {
      const m = repo.mockups.createMockup({ ...sample, title, libraryPath: `/lib/fts/${path}.psd` })
      repo.mockups.setStage([m.id], 'stashed')
      repo.search.upsertSearchIndex(m.id)
      return m.id
    }
    const japanese = make('日本 poster', 'jp')
    const cafe = make('Café menu', 'cafe')
    make('Caffeine label', 'caffeine')
    const ids = (q: string) => [...(repo.search.rankMatches(q) ?? new Map()).keys()]

    expect(ids('日本')).toEqual([japanese])
    expect(ids('café')).toEqual([cafe])
  })

  it('searches a hyphenated word as a phrase, the way the index splits it', () => {
    expect(ftsMatchQuery('t-shirt')).toBe('"t shirt"*')
    expect(ftsMatchQuery('z-fold brochure')).toBe('"z fold"* brochure*')
    expect(ftsMatchQuery('-flat- lay')).toBe('flat* lay*')
  })

  it('matches an -ies word as typed too, since the fold ("fries" to "fry") is not its prefix', () => {
    expect(ftsMatchQuery('fries')).toBe('(fries* OR fry*)')
    expect(ftsMatchQuery('golden pies')).toBe('golden* (pies* OR py*)')
    expect(ftsMatchQuery('series')).toBe('(series* OR sery*)')
    expect(ftsMatchQuery('french-fries')).toBe('("french fries"* OR "french fry"*)')
  })

  it('folds a plural to its singular, so "bags" also finds a stored "bag"', () => {
    expect(ftsMatchQuery('tote bags')).toBe('tote* bag*')
    expect(ftsMatchQuery('boxes brushes glasses')).toBe('box* brush* glass*')
    expect(ftsMatchQuery('stationeries iPhones')).toBe('(stationeries* OR stationery*) iPhone*')
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

describe('meaning search through the library', () => {
  const stash = (title: string, path: string) =>
    repo.mockups.createMockup({ ...sample, title, libraryPath: path, stage: 'stashed' })

  it('"jumper" finds a mockup tagged "sweatshirt" that keyword search misses', () => {
    ensureSearchIndex(db)
    seedTaxonomy(db)
    const m = stash('Black raglan top', '/lib/fts/m1.psd')
    const other = stash('Coffee cup', '/lib/fts/m2.psd')
    const apparel = repo.tags.getAllCategories().find((c) => c.label === 'Apparel')!
    const tag = repo.tags.createTag({ label: 'Sweatshirt', categoryId: apparel.id, createdBy: 'ai' })
    repo.mockups.addTagToMockup(m.id, tag.id)
    repo.search.rebuildSearchIndex()
    const stubSims = new Map([
      [m.id, 0.62],
      [other.id, 0.31]
    ])
    // Keyword search finds neither.
    expect(repo.library.getLibrary({ query: 'jumper', sort: 'date' })).toEqual([])
    const result = repo.library.queryLibrary({ query: 'jumper', sort: 'date', meaning: stubSims })
    expect(result.rows.map((r) => r.id)).toEqual([m.id])
    expect(result.meaningHit).toBe(true)
  })

  it('puts keyword hits first and adds the meaning hits after them', () => {
    ensureSearchIndex(db)
    const kw = stash('Jumper on a hanger', '/lib/fts/m3.psd')
    const sw = stash('Black sweatshirt', '/lib/fts/m4.psd')
    repo.search.rebuildSearchIndex()
    const sims = new Map([
      [kw.id, 0.9],
      [sw.id, 0.7]
    ])
    // The closest is already a keyword hit; the next one above the floor still joins (top 6, F-076).
    expect(repo.library.queryLibrary({ query: 'jumper', sort: 'date', meaning: sims })).toMatchObject({
      rows: [{ id: kw.id }, { id: sw.id }],
      meaningHit: true
    })
    const sims2 = new Map([
      [kw.id, 0.4],
      [sw.id, 0.7]
    ])
    const out = repo.library.queryLibrary({ query: 'jumper', sort: 'date', meaning: sims2 })
    expect(out.rows.map((r) => r.id)).toEqual([kw.id, sw.id])
    expect(out.meaningHit).toBe(true)
  })

  it('adds nothing below the floor, and nothing without meaning data', () => {
    ensureSearchIndex(db)
    const m = stash('Black sweatshirt', '/lib/fts/m5.psd')
    repo.search.rebuildSearchIndex()
    expect(
      repo.library.queryLibrary({ query: 'jumper', sort: 'date', meaning: new Map([[m.id, 0.4]]) }).rows
    ).toEqual([])
    expect(repo.library.queryLibrary({ query: 'jumper', sort: 'date', meaning: null }).rows).toEqual([])
  })
})
