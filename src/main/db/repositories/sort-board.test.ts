import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { Repository } from '../repository'
import { SortBoardRepository } from './sort-board'
import { batchSample, createTestDb } from './__tests__/setup'

let sqlite: Database.Database
let repo: Repository
let boards: SortBoardRepository

beforeEach(() => {
  const test = createTestDb()
  ;({ sqlite, repo } = test)
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
    expect(boards.load('b1')).toBeNull()
  })

  it('keeps the piles, their order and each top, and the mockups standing alone', () => {
    const [a, b, c, d, e] = toSort(5) as [number, number, number, number, number]
    boards.save({
      batchId: 'b1',
      groups: [
        { id: 'p1', memberIds: [c, a] },
        { id: 'p2', memberIds: [e, d] }
      ],
      singletonIds: [b]
    })
    expect(boards.load('b1')).toEqual({
      batchId: 'b1',
      groups: [
        { id: 'p1', memberIds: [c, a] },
        { id: 'p2', memberIds: [e, d] }
      ],
      singletonIds: [b]
    })
  })

  it('saving again replaces the board', () => {
    const [a, b] = toSort(2) as [number, number]
    boards.save({ batchId: 'b1', groups: [{ id: 'p', memberIds: [a, b] }], singletonIds: [] })
    boards.save({ batchId: 'b1', groups: [], singletonIds: [a, b] })
    expect(boards.load('b1')).toEqual({ batchId: 'b1', groups: [], singletonIds: [a, b] })
  })

  it('keeps one board per batch', () => {
    const [a] = toSort(1, 'b1') as [number]
    const [x] = toSort(1, 'b2') as [number]
    boards.save({ batchId: 'b1', groups: [], singletonIds: [a] })
    boards.save({ batchId: 'b2', groups: [], singletonIds: [x] })
    expect(boards.load('b1')?.singletonIds).toEqual([a])
    expect(boards.load('b2')?.singletonIds).toEqual([x])
  })

  it('clear forgets the board', () => {
    const [a] = toSort(1) as [number]
    boards.save({ batchId: 'b1', groups: [], singletonIds: [a] })
    boards.clear('b1')
    expect(boards.load('b1')).toBeNull()
  })

  describe('when the library changed while it was parked', () => {
    it('leaves out mockups that were trashed', () => {
      const [a, b, c] = toSort(3) as [number, number, number]
      boards.save({ batchId: 'b1', groups: [{ id: 'p', memberIds: [a, b, c] }], singletonIds: [] })
      repo.mockups.updateMockup(b, { deletedAt: new Date().toISOString() })
      expect(boards.load('b1')?.groups).toEqual([{ id: 'p', memberIds: [a, c] }])
    })

    it('leaves out mockups that already left To sort', () => {
      const [a, b] = toSort(2) as [number, number]
      boards.save({ batchId: 'b1', groups: [], singletonIds: [a, b] })
      repo.mockups.setStage([a], 'to_stash')
      expect(boards.load('b1')?.singletonIds).toEqual([b])
    })

    it('dissolves a pile that is down to one mockup', () => {
      const [a, b, c] = toSort(3) as [number, number, number]
      boards.save({ batchId: 'b1', groups: [{ id: 'p', memberIds: [a, b] }], singletonIds: [c] })
      repo.mockups.updateMockup(a, { deletedAt: new Date().toISOString() })
      const board = boards.load('b1')
      expect(board?.groups).toEqual([])
      expect(board?.singletonIds).toEqual([c, b])
    })

    it('adds mockups that arrived since as standing alone', () => {
      const [a] = toSort(1) as [number]
      boards.save({ batchId: 'b1', groups: [], singletonIds: [a] })
      const [late] = toSort(1) as [number]
      expect(boards.load('b1')?.singletonIds).toEqual([a, late])
    })

    it('forgets a board with nothing left in it', () => {
      const [a] = toSort(1) as [number]
      boards.save({ batchId: 'b1', groups: [], singletonIds: [a] })
      repo.mockups.setStage([a], 'stashed')
      expect(boards.load('b1')).toBeNull()
      expect(boards.load('b1')).toBeNull()
    })
  })
})
