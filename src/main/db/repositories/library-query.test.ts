import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '../schema'
import type { Repository } from '../repository'
import { seedTaxonomy } from '../bootstrap'
import { ensureSearchIndex } from '../search-index'
import { LibraryQueryRepository } from './library-query'
import { approvedMockup, createTestDb, sample } from './__tests__/setup'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let repo: Repository

beforeEach(() => {
  ;({ sqlite, db, repo } = createTestDb())
})

afterEach(() => sqlite.close())

describe('getLibrary', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  it('excludes non-approved and soft-deleted mockups', () => {
    const approved = repo.mockups.createMockup(
      approvedMockup({ title: 'Good One', libraryPath: '/lib/good.psd' })
    )
    repo.mockups.createMockup(
      approvedMockup({
        title: 'Needs Review',
        libraryPath: '/lib/nr.psd',
        stage: 'to_sort'
      })
    )
    const trashed = repo.mockups.createMockup(
      approvedMockup({ title: 'Trashed', libraryPath: '/lib/trash.psd' })
    )
    repo.mockups.updateMockup(trashed.id, { deletedAt: new Date().toISOString() })

    const result = repo.library.getLibrary({ sort: 'date' })
    const ids = result.map((r) => r.id)
    expect(ids).toContain(approved.id)
    expect(ids).not.toContain(trashed.id)
    expect(result.length).toBe(1)
  })

  it('shows what is stashed and nothing else, whatever else it says', () => {
    const stashed = repo.mockups.createMockup(
      approvedMockup({
        title: 'Stashed',
        libraryPath: '/lib/st.psd',
        stage: 'stashed'
      })
    )
    const waiting = repo.mockups.createMockup(
      approvedMockup({
        title: 'Waiting',
        libraryPath: '/lib/wt.psd',
        stage: 'to_stash'
      })
    )
    expect(repo.library.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([stashed.id])
    expect(repo.library.getLibraryStats().total).toBe(1)
    repo.mockups.setStage([waiting.id], 'stashed')
    expect(repo.library.getLibraryStats().total).toBe(2)
  })

  it('excludes group members and returns leader with the size of the pile', () => {
    const leader = repo.mockups.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/leader.psd', isGroup: true })
    )
    repo.mockups.createMockup(
      approvedMockup({ title: 'Member1', libraryPath: '/lib/m1.psd', groupId: leader.id })
    )
    repo.mockups.createMockup(
      approvedMockup({ title: 'Member2', libraryPath: '/lib/m2.psd', groupId: leader.id })
    )

    const result = repo.library.getLibrary({ sort: 'date' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(leader.id)
    expect(result[0]!.pile).toEqual({ memberCount: 3 })
  })

  it('does not float favourites to the top (Starred has its own view)', () => {
    const a = repo.mockups.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/fa.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'B', libraryPath: '/lib/fb.psd' }))
    repo.mockups.updateMockup(a.id, { createdAt: '2025-01-02T00:00:00' })
    repo.mockups.updateMockup(b.id, { createdAt: '2025-01-01T00:00:00' })
    repo.mockups.setFavourite(b.id, true)

    expect(repo.library.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([a.id, b.id])
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([a.id, b.id])
  })

  it('starredOnly keeps only favourites and still respects the other filters', () => {
    const allTags = repo.tags.getAllTags()
    const laptop = allTags.find((t) => t.label === 'Laptop')!
    const phone = allTags.find((t) => t.label === 'Phone')!

    const a = repo.mockups.createMockup(approvedMockup({ title: 'Laptop A', libraryPath: '/lib/la.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'Laptop B', libraryPath: '/lib/lb.psd' }))
    const c = repo.mockups.createMockup(approvedMockup({ title: 'Phone Only', libraryPath: '/lib/ph.psd' }))
    repo.mockups.addTagToMockup(a.id, laptop.id)
    repo.mockups.addTagToMockup(b.id, laptop.id)
    repo.mockups.addTagToMockup(c.id, phone.id)
    repo.mockups.setFavourite(c.id, true)
    repo.mockups.setFavourite(b.id, true)

    expect(repo.library.getLibrary({ starredOnly: true, sort: 'date' }).map((r) => r.id).sort()).toEqual(
      [b.id, c.id].sort()
    )
    expect(
      repo.library.getLibrary({ starredOnly: true, tagIds: [laptop.id], sort: 'date' }).map((r) => r.id)
    ).toEqual([b.id])
    expect(repo.library.getLibrary({ starredOnly: false, sort: 'date' })).toHaveLength(3)
  })

  it('returns createdAt, coverSource, coverMissing and pile on every item', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-lib-'))
    const coverPath = join(dir, 'cover.webp')
    writeFileSync(coverPath, 'x')
    try {
      const present = repo.mockups.createMockup(
        approvedMockup({ title: 'Present', libraryPath: '/lib/pr.psd', coverPath, coverSource: 'sidecar' })
      )
      const missing = repo.mockups.createMockup(
        approvedMockup({ title: 'Missing', libraryPath: '/lib/mi.psd', coverPath: join(dir, 'gone.webp') })
      )
      const leader = repo.mockups.createMockup(
        approvedMockup({ title: 'Leader', libraryPath: '/lib/ld.psd', isGroup: true })
      )
      repo.mockups.createMockup(approvedMockup({ title: 'V', libraryPath: '/lib/v.psd', groupId: leader.id }))

      const byId = new Map(repo.library.getLibrary({ sort: 'date' }).map((r) => [r.id, r]))
      expect(byId.get(present.id)).toMatchObject({
        coverSource: 'sidecar',
        coverMissing: false,
        pile: null
      })
      expect(typeof byId.get(present.id)!.createdAt).toBe('string')
      expect(byId.get(missing.id)).toMatchObject({ coverSource: 'embedded', coverMissing: true })
      expect(byId.get(leader.id)).toMatchObject({ pile: { memberCount: 2 } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('getLibrary matches a picked tag directly, with no roll-up to other tags', () => {
    const allTags = repo.tags.getAllTags()
    const laptop = allTags.find((t) => t.label === 'Laptop')!
    const macbook = allTags.find((t) => t.label === 'MacBook')!

    const a = repo.mockups.createMockup(approvedMockup({ title: 'MacBook', libraryPath: '/lib/mb.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'Laptop', libraryPath: '/lib/lp.psd' }))
    repo.mockups.addTagToMockup(a.id, macbook.id)
    repo.mockups.addTagToMockup(b.id, laptop.id)

    const ids = repo.library.getLibrary({ tagIds: [laptop.id], sort: 'date' }).map((r) => r.id)
    expect(ids).toEqual([b.id])
  })

  it('getLibrary needs every picked tag to match (AND)', () => {
    const tags = repo.tags.getAllTags()
    const laptop = tags.find((t) => t.label === 'Laptop')!
    const minimal = tags.find((t) => t.label === 'Minimal')!

    const both = repo.mockups.createMockup(approvedMockup({ title: 'Both', libraryPath: '/lib/both.psd' }))
    const one = repo.mockups.createMockup(approvedMockup({ title: 'One', libraryPath: '/lib/one.psd' }))
    repo.mockups.addTagToMockup(both.id, laptop.id)
    repo.mockups.addTagToMockup(both.id, minimal.id)
    repo.mockups.addTagToMockup(one.id, laptop.id)

    const ids = repo.library.getLibrary({ tagIds: [laptop.id, minimal.id], sort: 'date' }).map((r) => r.id)
    expect(ids).toEqual([both.id])
  })

  it('getLibrary rolls a category filter up to every tag in it', () => {
    const tags = repo.tags.getAllTags()
    const device = repo.tags.getAllCategories().find((c) => c.label === 'Device')!
    const style = repo.tags.getAllCategories().find((c) => c.label === 'Style')!
    const laptop = tags.find((t) => t.label === 'Laptop')!
    const iphone = tags.find((t) => t.label === 'iPhone')!
    const minimal = tags.find((t) => t.label === 'Minimal')!

    const a = repo.mockups.createMockup(approvedMockup({ title: 'Laptop', libraryPath: '/lib/c1.psd' }))
    const b = repo.mockups.createMockup(approvedMockup({ title: 'iPhone', libraryPath: '/lib/c2.psd' }))
    const c = repo.mockups.createMockup(
      approvedMockup({ title: 'Minimal only', libraryPath: '/lib/c3.psd' })
    )
    repo.mockups.addTagToMockup(a.id, laptop.id)
    repo.mockups.addTagToMockup(b.id, iphone.id)
    repo.mockups.addTagToMockup(b.id, minimal.id)
    repo.mockups.addTagToMockup(c.id, minimal.id)

    const byDevice = repo.library.getLibrary({ categoryIds: [device.id], sort: 'name' }).map((r) => r.id)
    expect(byDevice).toEqual([b.id, a.id])

    // Categories AND together, and with picked tags.
    const deviceAndStyle = repo
      .library.getLibrary({ categoryIds: [device.id, style.id], sort: 'date' })
      .map((r) => r.id)
    expect(deviceAndStyle).toEqual([b.id])
    const deviceAndMinimal = repo
      .library.getLibrary({ categoryIds: [device.id], tagIds: [minimal.id], sort: 'date' })
      .map((r) => r.id)
    expect(deviceAndMinimal).toEqual([b.id])
  })

  it('search filters and prefix-matches by title/description/tags', () => {
    const a = repo.mockups.createMockup(
      approvedMockup({ title: 'MacBook Pro Hero', libraryPath: '/lib/a.psd' })
    )
    const b = repo.mockups.createMockup(
      approvedMockup({ title: 'iPhone Screen', libraryPath: '/lib/b.psd' })
    )
    const c = repo.mockups.createMockup(
      approvedMockup({ title: 'Another Laptop', libraryPath: '/lib/c.psd' })
    )

    repo.search.upsertSearchIndex(a.id)
    repo.search.upsertSearchIndex(b.id)
    repo.search.upsertSearchIndex(c.id)

    const macResult = repo.library.getLibrary({ query: 'macbook', sort: 'date' })
    const ids = macResult.map((r) => r.id)
    expect(ids).toContain(a.id)
    expect(ids).not.toContain(b.id)

    // prefix match: 'mac' matches 'macbook'
    const prefixResult = repo.library.getLibrary({ query: 'mac', sort: 'date' })
    expect(prefixResult.map((r) => r.id)).toContain(a.id)
  })

  it('a search with no word to look for finds nothing, never the whole library', () => {
    repo.mockups.createMockup(approvedMockup({ title: 'Mug', libraryPath: '/lib/nothing-1.psd' }))
    repo.mockups.createMockup(approvedMockup({ title: 'Cup', libraryPath: '/lib/nothing-2.psd' }))

    expect(repo.library.getLibrary({ query: '!!', sort: 'date' })).toEqual([])
    expect(repo.library.getLibrary({ query: '  ', sort: 'date' })).toHaveLength(2)
  })

  it('finds a title written in another script', () => {
    const jp = repo.mockups.createMockup(approvedMockup({ title: '日本 poster', libraryPath: '/lib/jp.psd' }))
    const other = repo.mockups.createMockup(approvedMockup({ title: 'Mug', libraryPath: '/lib/mug.psd' }))
    for (const m of [jp, other]) repo.search.upsertSearchIndex(m.id)

    expect(repo.library.getLibrary({ query: '日本', sort: 'date' }).map((r) => r.id)).toEqual([jp.id])
  })

  it('sort:name orders A to Z and sort:date newest first', () => {
    const z = repo.mockups.createMockup(approvedMockup({ title: 'Zebra', libraryPath: '/lib/z.psd' }))
    const ap = repo.mockups.createMockup(approvedMockup({ title: 'Apple', libraryPath: '/lib/ap.psd' }))
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Mango', libraryPath: '/lib/mg.psd' }))
    repo.mockups.updateMockup(z.id, { createdAt: '2025-01-01T00:00:00' })
    repo.mockups.updateMockup(ap.id, { createdAt: '2025-01-02T00:00:00' })
    repo.mockups.updateMockup(m.id, { createdAt: '2025-01-03T00:00:00' })
    repo.mockups.setFavourite(m.id, true)

    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([ap.id, m.id, z.id])
    expect(repo.library.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([m.id, ap.id, z.id])
  })

  it('sort:date puts the later of mockups added in the same second first, as between hauls', () => {
    const [a, b, c] = ['A', 'B', 'C'].map((title) =>
      repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/same-${title}.psd` }))
    )
    for (const m of [a!, b!, c!]) repo.mockups.updateMockup(m.id, { createdAt: '2026-10-12 09:00:00' })

    expect(repo.library.getLibrary({ sort: 'date' }).map((r) => r.id)).toEqual([c!.id, b!.id, a!.id])
  })
})

describe('getMockupDetail', () => {
  beforeEach(() => seedTaxonomy(db))

  it('returns mockup, tags, and variants for a group leader', () => {
    const leader = repo.mockups.createMockup(
      approvedMockup({ title: 'Leader', libraryPath: '/lib/ld.psd', isGroup: true })
    )
    repo.mockups.createMockup(
      approvedMockup({ title: 'V1', libraryPath: '/lib/v1.psd', groupId: leader.id })
    )
    repo.mockups.createMockup(
      approvedMockup({ title: 'V2', libraryPath: '/lib/v2.psd', groupId: leader.id })
    )
    const laptop = repo.tags.getAllTags().find((t) => t.label === 'Laptop')!
    repo.mockups.addTagToMockup(leader.id, laptop.id)

    const detail = repo.library.getMockupDetail(leader.id)

    expect(detail.mockup?.id).toBe(leader.id)
    expect(detail.variants).toHaveLength(2)
    expect(detail.tags).toHaveLength(1)
    expect(detail.tags[0]!.label).toBe('Laptop')
    expect(detail.tags[0]!.categoryLabel).toBeTruthy()
  })

  it('returns empty variants for a singleton', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Solo', libraryPath: '/lib/so.psd' }))
    const detail = repo.library.getMockupDetail(m.id)
    expect(detail.mockup?.id).toBe(m.id)
    expect(detail.variants).toHaveLength(0)
  })

  it('returns mockup=undefined for missing id', () => {
    const detail = repo.library.getMockupDetail(9999)
    expect(detail.mockup).toBeUndefined()
  })
})

describe('getDetailVariants', () => {
  it('lists the top first, then the other mockups in the pile, with cover state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-var-'))
    const coverPath = join(dir, 'cover.webp')
    writeFileSync(coverPath, 'x')
    try {
      const top = repo.mockups.createMockup(
        approvedMockup({ title: 'front', libraryPath: '/lib/t.psd', isGroup: true, coverPath })
      )
      const side = repo.mockups.createMockup(
        approvedMockup({ title: 'side', libraryPath: '/lib/s.psd', groupId: top.id })
      )

      expect(repo.library.getDetailVariants(top.id)).toEqual([
        { id: top.id, title: 'front', coverPath, coverMissing: false, coverSource: 'embedded', isTop: true, variation: null },
        { id: side.id, title: 'side', coverPath: '/c.png', coverMissing: true, coverSource: 'embedded', isTop: false, variation: null }
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is empty for a mockup on its own or a missing id', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Solo', libraryPath: '/lib/so2.psd' }))
    expect(repo.library.getDetailVariants(m.id)).toEqual([])
    expect(repo.library.getDetailVariants(9999)).toEqual([])
  })
})

describe('a big library', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  /** My Stash's list with a counted check for each cover file. */
  const withCoverCheck = (present: (path: string) => boolean = () => true) => {
    const fileExists = vi.fn(present)
    const library = new LibraryQueryRepository(db, repo.mockups, repo.piles, repo.search, fileExists)
    return { fileExists, library }
  }

  it('checks each cover on disk once, however often the list is asked for', () => {
    for (let i = 0; i < 1000; i++) {
      const m = repo.mockups.createMockup(
        approvedMockup({ title: `Mug ${i}`, libraryPath: `/lib/big${i}.psd`, coverPath: `/c/big${i}.png` })
      )
      if (i < 20) repo.search.upsertSearchIndex(m.id)
    }
    const { fileExists, library } = withCoverCheck()

    expect(library.getLibrary({ sort: 'date' })).toHaveLength(1000)
    expect(fileExists).toHaveBeenCalledTimes(1000)

    fileExists.mockClear()
    expect(library.getLibrary({ sort: 'name' })).toHaveLength(1000)
    expect(library.getLibrary({ sort: 'date', query: 'mug' })).toHaveLength(20)
    expect(fileExists).not.toHaveBeenCalled()
  })

  it('checks a missing cover again each time, so it shows as soon as it is back', () => {
    const m = repo.mockups.createMockup(approvedMockup({ title: 'Gone', coverPath: '/c/gone.png' }))
    let back = false
    const { library } = withCoverCheck(() => back)

    expect(library.getLibrary({ sort: 'date' })).toMatchObject([{ id: m.id, coverMissing: true }])
    back = true
    expect(library.getLibrary({ sort: 'date' })).toMatchObject([{ id: m.id, coverMissing: false }])
  })

  it('checks a cover again once the stash folder says it changed, and every cover in a folder that did', () => {
    const covers = ['/s/mockups/a/cover.webp', '/s/mockups/b/cover.webp', '/s/mockups/bb/cover.webp']
    const [a, b, bb] = covers.map((coverPath, i) =>
      repo.mockups.createMockup(approvedMockup({ title: `C${i}`, libraryPath: `/lib/c${i}.psd`, coverPath }))
    )
    const present = new Set(covers)
    const { fileExists, library } = withCoverCheck((path) => present.has(path))
    const missing = () =>
      Object.fromEntries(library.getLibrary({ sort: 'date' }).map((r) => [r.id, r.coverMissing]))
    expect(missing()).toEqual({ [a!.id]: false, [b!.id]: false, [bb!.id]: false })
    for (const path of covers) present.delete(path)
    fileExists.mockClear()

    library.forgetCoversUnder('/s/mockups/a/cover.webp')
    expect(missing()).toEqual({ [a!.id]: true, [b!.id]: false, [bb!.id]: false })
    expect(fileExists).toHaveBeenCalledTimes(1)

    library.forgetCoversUnder('/s/mockups/b')
    expect(missing()).toEqual({ [a!.id]: true, [b!.id]: true, [bb!.id]: false })
  })

  it('filters by tag and category in the query, so only the matches are read further', () => {
    const tags = repo.tags.getAllTags()
    const laptop = tags.find((t) => t.label === 'Laptop')!
    const minimal = tags.find((t) => t.label === 'Minimal')!
    const style = repo.tags.getAllCategories().find((c) => c.label === 'Style')!
    const ids = Array.from({ length: 20 }, (_, i) =>
      repo.mockups.createMockup(approvedMockup({ title: `T${i}`, libraryPath: `/lib/t${i}.psd` })).id
    )
    repo.mockups.addTagToMockup(ids[3]!, laptop.id)
    repo.mockups.addTagToMockup(ids[3]!, minimal.id)
    repo.mockups.addTagToMockup(ids[7]!, laptop.id)
    const { fileExists, library } = withCoverCheck()
    const lookups = vi.spyOn(library, 'loadLookups')

    expect(library.getLibrary({ tagIds: [laptop.id], categoryIds: [style.id], sort: 'date' }).map((r) => r.id)).toEqual([
      ids[3]
    ])
    expect(lookups.mock.calls).toEqual([[[ids[3]]]])
    expect(fileExists).toHaveBeenCalledTimes(1)
  })
})

describe('getLibraryStats', () => {
  it('returns correct counts for a mixed fixture', () => {
    // approved, non-deleted, top-level
    const a = repo.mockups.createMockup(approvedMockup({ title: 'A', libraryPath: '/lib/a.psd' }))
    const b = repo.mockups.createMockup(
      approvedMockup({ title: 'B', libraryPath: '/lib/b.psd', isGroup: true })
    )
    repo.mockups.createMockup(approvedMockup({ title: 'C', libraryPath: '/lib/c.psd', groupId: b.id })) // member, excluded
    repo.mockups.setFavourite(a.id, true)

    // not stashed → not counted in total
    repo.mockups.createMockup({ ...sample, title: 'NR', libraryPath: '/lib/nr.psd' })

    // trashed (approved but deletedAt set)
    const t = repo.mockups.createMockup(approvedMockup({ title: 'T', libraryPath: '/lib/t.psd' }))
    repo.mockups.updateMockup(t.id, { deletedAt: '2025-01-01T00:00:00' })

    const stats = repo.library.getLibraryStats()

    expect(stats.total).toBe(2) // a and b (not member, not waiting to be stashed, not trashed)
    expect(stats.favourites).toBe(1) // a
    expect(stats.groups).toBe(1) // b
    expect(stats.trashed).toBe(1) // t
  })
})

describe('base titles and variations in My Stash (design/specs/pile-titles.md)', () => {
  beforeEach(() => {
    seedTaxonomy(db)
    ensureSearchIndex(db)
  })

  /** The long scroll pile from the dev library: a base, and "wavy surface" on its last mockup. */
  function longScrolls() {
    const make = (title: string, path: string, extra = {}) =>
      repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/${path}.psd`, description: 'A laptop on books', ...extra }))
    const top = make('Long scroll MacBook', 'a', { isGroup: true, variation: 'front', variationSource: 'ai' })
    const side = make('Long scroll MacBook', 'b', { groupId: top.id, variation: 'side view', variationSource: 'ai' })
    const wavy = make('Long scroll MacBook', 'c', { groupId: top.id, variation: 'wavy surface', variationSource: 'typed' })
    const other = make('Clay iPhone', 'd')
    for (const m of [top, side, wavy, other]) repo.search.upsertSearchIndex(m.id)
    return { top, side, wavy, other }
  }

  it('finds a pile by a word only one of its mockups’ variations has, by keyword', () => {
    const { top } = longScrolls()
    expect(repo.library.getLibrary({ sort: 'date', query: 'wavy' }).map((r) => r.id)).toEqual([top.id])
  })

  it('embeds the full title for meaning search, and a close mockup in a pile brings up its pile', () => {
    const { top, wavy, other } = longScrolls()
    expect(repo.search.meaningDocuments().find((d) => d.id === wavy.id)?.text).toContain('Long scroll MacBook · wavy surface')

    // "rippled" matches no word, so only meaning search can find it: the wavy mockup is the closest.
    const meaning = new Map([
      [wavy.id, 0.9],
      [other.id, 0.1]
    ])
    const { rows, meaningHit } = repo.library.queryLibrary({ sort: 'date', query: 'rippled', meaning })
    expect(rows.map((r) => r.id)).toEqual([top.id])
    expect(meaningHit).toBe(true)
  })

  it('sends the pile and the variation with every row', () => {
    const { top, wavy, other } = longScrolls()
    const rows = repo.library.toRows([top, wavy, other].map((m) => repo.mockups.getMockup(m.id)!))
    expect(rows.map((r) => [r.title, r.pileId, r.variation])).toEqual([
      ['Long scroll MacBook', top.id, { words: 'front', source: 'ai' }],
      ['Long scroll MacBook', top.id, { words: 'wavy surface', source: 'typed' }],
      ['Clay iPhone', null, null]
    ])
    expect(repo.library.getDetailVariants(top.id).map((v) => v.variation?.words)).toEqual(['front', 'side view', 'wavy surface'])
  })
})
