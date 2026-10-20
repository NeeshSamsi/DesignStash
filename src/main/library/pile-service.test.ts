import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../db/repository'
import { ensureSearchIndex } from '../db/search-index'
import { approvedMockup, createTestDb } from '../db/repositories/__tests__/setup'
import { PileService } from './pile-service'

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
