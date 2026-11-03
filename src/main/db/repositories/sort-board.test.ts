import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { TO_SORT_BOARD } from '@shared/grouping'
import type { Repository } from '../repository'
import { sortBoards } from '../schema'
import { SortBoardRepository } from './sort-board'
import { batchSample, createTestDb, type TestDb } from './__tests__/setup'

let sqlite: Database.Database
let db: TestDb['db']
let repo: Repository
let boards: SortBoardRepository

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo, db } = test)
  boards = new SortBoardRepository(test.db)
})

afterEach(() => sqlite.close())

/** n mockups waiting in To sort, in one batch. */
function toSort(n: number, batch = 'b1'): number[] {
  return Array.from({ length: n }, (_, i) => {
    const row = repo.mockups.createMockup({
      ...batchSample(batch),
      title: `M${i}`,
      libraryPath: `/lib/${batch}/${i}.psd`,
      stage: 'to_sort'
    })
    return row.id
  })
}

describe('SortBoardRepository', () => {
  it('has nothing to load before the first save', () => {
    expect(boards.load()).toBeNull()
  })

  it('keeps the piles, their order and each top, and the mockups standing alone', () => {
    const [a, b, c, d, e] = toSort(5) as [number, number, number, number, number]
    boards.save({
      batchId: TO_SORT_BOARD,
      groups: [
        { id: 'p1', memberIds: [c, a] },
        { id: 'p2', memberIds: [e, d] }
      ],
      singletonIds: [b]
    })
    expect(boards.load()).toEqual({
      batchId: TO_SORT_BOARD,
      groups: [
        { id: 'p1', memberIds: [c, a] },
        { id: 'p2', memberIds: [e, d] }
      ],
      singletonIds: [b]
    })
  })

  it('saving again replaces the board', () => {
    const [a, b] = toSort(2) as [number, number]
    boards.save({
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: []
    })
    boards.save({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a, b] })
    expect(boards.load()).toEqual({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a, b] })
  })

  it('keeps one board for everything in To sort, a pile across two imports included', () => {
    const [a, b] = toSort(2, 'b1') as [number, number]
    const [x] = toSort(1, 'b2') as [number]
    boards.save({
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [x, a] }],
      singletonIds: [b]
    })
    expect(boards.load()).toEqual({
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [x, a] }],
      singletonIds: [b]
    })
  })

  it('reads boards saved per import, before there was one board, as one', () => {
    const [a, b] = toSort(2, 'b1') as [number, number]
    const [x, y] = toSort(2, 'b2') as [number, number]
    db.insert(sortBoards)
      .values([
        {
          batchId: 'b1',
          board: { batchId: 'b1', groups: [{ id: 'p', memberIds: [a, b] }], singletonIds: [] }
        },
        { batchId: 'b2', board: { batchId: 'b2', groups: [], singletonIds: [y, x] } }
      ])
      .run()
    expect(boards.load()).toEqual({
      batchId: TO_SORT_BOARD,
      groups: [{ id: 'p', memberIds: [a, b] }],
      singletonIds: [y, x]
    })
    boards.save({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a, b, x, y] })
    expect(
      db
        .select()
        .from(sortBoards)
        .all()
        .map((r) => r.batchId)
    ).toEqual([TO_SORT_BOARD])
  })

  it('lists every mockup waiting in To sort, across imports, oldest first', () => {
    const [a] = toSort(1, 'b1') as [number]
    const [x, y] = toSort(2, 'b2') as [number, number]
    repo.mockups.setStage([y], 'to_stash')
    expect(boards.waiting().map((m) => m.id)).toEqual([a, x])
  })

  describe('taking confirmed mockups off it', () => {
    it('keeps the rest of the board as it was', () => {
      const [a, b, c, d] = toSort(4) as [number, number, number, number]
      boards.save({
        batchId: TO_SORT_BOARD,
        groups: [
          { id: 'p', memberIds: [a, b] },
          { id: 'q', memberIds: [c, d] }
        ],
        singletonIds: []
      })
      boards.remove([a, b])
      repo.mockups.setStage([a, b], 'to_stash')
      expect(boards.load()).toEqual({
        batchId: TO_SORT_BOARD,
        groups: [{ id: 'q', memberIds: [c, d] }],
        singletonIds: []
      })
    })

    it('forgets a board with none of its own mockups left, so later ones get fresh piles', () => {
      const [a, b] = toSort(2) as [number, number]
      boards.save({
        batchId: TO_SORT_BOARD,
        groups: [{ id: 'p', memberIds: [a, b] }],
        singletonIds: []
      })
      toSort(1)
      boards.remove([a, b])
      repo.mockups.setStage([a, b], 'to_stash')
      expect(boards.load()).toBeNull()
    })
  })

  describe('when the library changed while it was parked', () => {
    it('leaves out mockups that were trashed', () => {
      const [a, b, c] = toSort(3) as [number, number, number]
      boards.save({
        batchId: TO_SORT_BOARD,
        groups: [{ id: 'p', memberIds: [a, b, c] }],
        singletonIds: []
      })
      repo.mockups.updateMockup(b, { deletedAt: new Date().toISOString() })
      expect(boards.load()?.groups).toEqual([{ id: 'p', memberIds: [a, c] }])
    })

    it('leaves out mockups that already left To sort', () => {
      const [a, b] = toSort(2) as [number, number]
      boards.save({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a, b] })
      repo.mockups.setStage([a], 'to_stash')
      expect(boards.load()?.singletonIds).toEqual([b])
    })

    it('dissolves a pile that is down to one mockup', () => {
      const [a, b, c] = toSort(3) as [number, number, number]
      boards.save({
        batchId: TO_SORT_BOARD,
        groups: [{ id: 'p', memberIds: [a, b] }],
        singletonIds: [c]
      })
      repo.mockups.updateMockup(a, { deletedAt: new Date().toISOString() })
      const board = boards.load()
      expect(board?.groups).toEqual([])
      expect(board?.singletonIds).toEqual([c, b])
    })

    it('adds mockups that arrived since as standing alone', () => {
      const [a] = toSort(1) as [number]
      boards.save({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a] })
      const [late] = toSort(1) as [number]
      expect(boards.load()?.singletonIds).toEqual([a, late])
    })

    it('forgets a board with nothing left in it', () => {
      const [a] = toSort(1) as [number]
      boards.save({ batchId: TO_SORT_BOARD, groups: [], singletonIds: [a] })
      repo.mockups.setStage([a], 'stashed')
      expect(boards.load()).toBeNull()
      expect(boards.load()).toBeNull()
    })
  })
})
