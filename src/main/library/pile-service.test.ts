import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { PileService } from './pile-service'
import { PileTitles } from './pile-titles'

let sqlite: Database.Database
let repo: Repository
let piles: PileService

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
  ensureSearchIndex(test.db)
  piles = new PileService(repo)
})

afterEach(() => sqlite.close())

const make = (title: string) =>
  repo.mockups.createMockup(approvedMockup({ title, libraryPath: `/lib/${title}.psd` })).id

const place = (ids: number[]) =>
  ids.map((id) => {
    const m = repo.mockups.getMockup(id)!
    return { id, isGroup: m.isGroup, groupId: m.groupId }
  })

describe('PileService undo', () => {
  it('undoes a new pile', () => {
    const [a, b] = [make('a'), make('b')] as [number, number]
    const { snapshot } = piles.create([a, b], a)
    expect(place([a, b])[1]!.groupId).toBe(a)

    expect(piles.restore(snapshot).restoredIds.sort()).toEqual([a, b].sort())
    expect(place([a, b])).toEqual([
      { id: a, isGroup: false, groupId: null },
      { id: b, isGroup: false, groupId: null }
    ])
  })

  it('undoes adding to a pile', () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    const { pileId } = piles.create([a, b], a)
    const { snapshot } = piles.add(pileId, [c])

    piles.restore(snapshot)

    expect(place([c])).toEqual([{ id: c, isGroup: false, groupId: null }])
    expect(repo.piles.getMockupsByGroupId(a).map((m) => m.id)).toEqual([b])
  })

  it('undoes a merge, giving the source pile back with its own top', () => {
    const [a, b, c, d] = [make('a'), make('b'), make('c'), make('d')] as [number, number, number, number]
    const target = piles.create([a, b], a)
    const source = piles.create([c, d], c)

    const { snapshot } = piles.merge([source.pileId], target.pileId)
    piles.restore(snapshot)

    expect(place([c, d])).toEqual([
      { id: c, isGroup: true, groupId: null },
      { id: d, isGroup: false, groupId: c }
    ])
    expect(repo.piles.getMockupsByGroupId(a).map((m) => m.id)).toEqual([b])
  })

  it('undoes Put on top, so the old top leads again', () => {
    const [a, b] = [make('a'), make('b')] as [number, number]
    const { pileId } = piles.create([a, b], a)

    const moved = piles.setTop(pileId, b)
    expect(moved.pileId).toBe(b)
    piles.restore(moved.snapshot)

    expect(place([a, b])).toEqual([
      { id: a, isGroup: true, groupId: null },
      { id: b, isGroup: false, groupId: a }
    ])
  })

  it('undoes a disband, and reports which mockups were freed', () => {
    const [a, b, c] = [make('a'), make('b'), make('c')] as [number, number, number]
    const { pileId } = piles.create([a, b, c], a)

    const { snapshot, freedIds } = piles.disband(pileId)
    expect(freedIds.sort()).toEqual([a, b, c].sort())
    expect(repo.library.getLibrary({ sort: 'name' })).toHaveLength(3)

    piles.restore(snapshot)
    expect(repo.library.getLibrary({ sort: 'name' }).map((r) => r.id)).toEqual([a])
    expect(repo.piles.getMockupsByGroupId(a).map((m) => m.id).sort()).toEqual([b, c].sort())
  })

  it('leaves out mockups that were deleted before the undo', () => {
    const [a, b] = [make('a'), make('b')] as [number, number]
    const { snapshot } = piles.create([a, b], a)
    repo.trash.deleteMockupsHard([b])

    expect(piles.restore(snapshot).restoredIds).toEqual([a])
  })
})

describe('PileService: base titles and variations (design/specs/pile-titles.md)', () => {
  /** A stashed mockup that came in as `fileName`. */
  const file = (fileName: string, title = fileName.replace(/\.psd$/, '')) =>
    repo.mockups.createMockup(
      approvedMockup({
        title,
        libraryPath: `/lib/${fileName}`,
        importContext: { batchId: 'b', folderTrail: [], originalFilename: fileName }
      })
    ).id
  const titleOf = (id: number) => {
    const m = repo.mockups.getMockup(id)!
    return [m.title, m.variation, m.variationSource]
  }
  const ftsTitle = (id: number) =>
    (sqlite.prepare('SELECT title FROM mockups_fts WHERE rowid = ?').get(id) as { title: string } | undefined)?.title

  it('a new pile takes its top’s title as the base, and each mockup its file marker', () => {
    const [a, b] = [file('tote-a.psd', 'Canvas tote'), file('tote-b.psd', 'Tote on a hook')]
    piles.create([a, b], a)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['Canvas tote', 'A', 'marker'],
      ['Canvas tote', 'B', 'marker']
    ])
    expect(ftsTitle(b)).toBe('Canvas tote · B')
  })

  it('a mockup that joins takes the base and its marker, and the rest keep theirs', () => {
    const [a, b, c] = [file('tote-a.psd'), file('tote-b.psd'), file('tote-c.psd')]
    const { pileId } = piles.create([a, b], a)
    new PileTitles(repo).setVariation(b, 'on a hook')

    piles.add(pileId, [c])

    expect([titleOf(b), titleOf(c)]).toEqual([
      ['tote-a', 'on a hook', 'typed'],
      ['tote-a', 'C', 'marker']
    ])
  })

  it('a merge keeps what a person typed on the mockups that join', () => {
    const [a, b, c, d] = [file('mug-1.psd'), file('mug-2.psd'), file('cup-x.psd'), file('cup-y.psd')]
    const target = piles.create([a, b], a)
    const source = piles.create([c, d], c)
    new PileTitles(repo).setVariation(d, 'steaming')

    piles.merge([source.pileId], target.pileId)

    expect([titleOf(c), titleOf(d)]).toEqual([
      ['mug-1', 'X', 'marker'],
      ['mug-1', 'steaming', 'typed']
    ])
  })

  it('Put on top leaves every title as it is', () => {
    const [a, b] = [file('tote-a.psd'), file('tote-b.psd')]
    const { pileId } = piles.create([a, b], a)
    piles.setTop(pileId, b)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['tote-a', 'A', 'marker'],
      ['tote-a', 'B', 'marker']
    ])
  })

  it('a mockup taken out keeps its full title as its own, and Undo puts the pile’s back', () => {
    const [a, b, c] = [file('tote-a.psd'), file('tote-b.psd'), file('tote-c.psd')]
    const { pileId } = piles.create([a, b, c], a)

    const { snapshot } = piles.removeFromPile(pileId, c)
    expect(titleOf(c)).toEqual(['tote-a · C', null, null])
    expect(ftsTitle(c)).toBe('tote-a · C')

    piles.restore(snapshot)
    expect(titleOf(c)).toEqual(['tote-a', 'C', 'marker'])
    expect(ftsTitle(c)).toBe('tote-a · C')
  })

  it('a disband gives every mockup its full title, and Undo brings the base back', () => {
    const [a, b] = [file('tote-a.psd', 'Canvas tote'), file('tote-b.psd')]
    const { pileId } = piles.create([a, b], a)

    const { snapshot } = piles.disband(pileId)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['Canvas tote · A', null, null],
      ['Canvas tote · B', null, null]
    ])

    piles.restore(snapshot)
    expect([titleOf(a), titleOf(b)]).toEqual([
      ['Canvas tote', 'A', 'marker'],
      ['Canvas tote', 'B', 'marker']
    ])
  })

  it('Undo of a new pile gives each mockup its own title back', () => {
    const [a, b] = [file('tote-a.psd', 'Canvas tote'), file('tote-b.psd', 'Tote on a hook')]
    const { snapshot } = piles.create([a, b], a)
    piles.restore(snapshot)
    expect(titleOf(b)).toEqual(['Tote on a hook', null, null])
    expect(ftsTitle(b)).toBe('Tote on a hook')
  })
})
