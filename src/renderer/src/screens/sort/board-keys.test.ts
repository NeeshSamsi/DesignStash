import { describe, expect, it } from 'vitest'
import type { GroupMember, GroupingProposal } from '@shared/grouping'
import { boardFromProposal } from './board-model'
import { nearestTile, stepTile } from './board-keys'

const member = (id: number): GroupMember => ({
  mockupId: id,
  fileName: `${id}.psd`,
  folderTrail: [],
  coverPath: '',
  isPrimary: false
})

/** Pile "a": 1, 2. Pile "b": 3, 4, 5. On its own: 6, 7. */
const board = () => {
  const proposal: GroupingProposal = {
    batchId: 'to-sort',
    groups: [
      { id: 'a', members: [member(1), member(2)], reason: 'stem' },
      { id: 'b', members: [member(3), member(4), member(5)], reason: 'stem' }
    ],
    singletons: [member(6), member(7)]
  }
  return boardFromProposal(proposal)
}

describe('stepping through the tiles (F-046)', () => {
  it('goes through the piles, then the tray, in reading order', () => {
    expect(stepTile(board(), 2, 'next')).toBe(3)
    expect(stepTile(board(), 5, 'next')).toBe(6)
    expect(stepTile(board(), 6, 'previous')).toBe(5)
  })

  it('stays put at either end', () => {
    expect(stepTile(board(), 1, 'previous')).toBe(1)
    expect(stepTile(board(), 7, 'next')).toBe(7)
  })

  it('starts on the first tile from nowhere, or from a tile that has gone', () => {
    expect(stepTile(board(), null, 'next')).toBe(1)
    expect(stepTile(board(), 99, 'previous')).toBe(1)
  })

  it('has nowhere to go on an empty board', () => {
    expect(
      stepTile(boardFromProposal({ batchId: 'to-sort', groups: [], singletons: [] }), null, 'next')
    ).toBeNull()
  })
})

describe('the tile above or below (F-046)', () => {
  const rect = (x: number, y: number) => ({ left: x, top: y, width: 100, height: 100 })
  // Two rows: 1 and 2 on top, 3, 4 and 5 under them.
  const tiles = [
    { id: 1, rect: rect(0, 0) },
    { id: 2, rect: rect(120, 0) },
    { id: 3, rect: rect(0, 200) },
    { id: 4, rect: rect(120, 200) },
    { id: 5, rect: rect(240, 200) }
  ]

  it('takes the nearest tile in the next row, closest across', () => {
    expect(nearestTile(tiles, 2, 'down')).toBe(4)
    expect(nearestTile(tiles, 5, 'up')).toBe(2)
    expect(nearestTile(tiles, 3, 'up')).toBe(1)
  })

  it('has none past the top or bottom row', () => {
    expect(nearestTile(tiles, 1, 'up')).toBeNull()
    expect(nearestTile(tiles, 4, 'down')).toBeNull()
  })
})
