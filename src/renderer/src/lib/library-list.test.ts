import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@shared/library'
import {
  draggedItems,
  dropHint,
  mergeLingering,
  noResultsCopy,
  pilesIn,
  planDrop,
  planNewPile
} from './library-list'

const item = (id: number, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  title: `Mockup ${id}`,
  description: null,
  coverPath: '',
  coverSource: 'embedded',
  coverMissing: false,
  isGroup: false,
  favourite: true,
  createdAt: '2026-10-01',
  variantCount: 0,
  topId: null,
  tags: [],
  ...over
})
const pile = (id: number) => item(id, { isGroup: true, variantCount: 2, topId: id })

describe('mergeLingering', () => {
  it('is the fresh list when nothing lingers', () => {
    expect(mergeLingering([item(1)], [item(2)], new Set()).map((i) => i.id)).toEqual([2])
  })

  it('puts an unstarred card back where it was, shown as unstarred', () => {
    const merged = mergeLingering([item(1), item(2), item(3)], [item(1), item(3)], new Set([2]))
    expect(merged.map((i) => [i.id, i.favourite])).toEqual([
      [1, true],
      [2, false],
      [3, true]
    ])
  })

  it('does not duplicate a card the fetch still has', () => {
    expect(mergeLingering([item(1)], [item(1)], new Set([1]))).toHaveLength(1)
  })

  it('ignores lingering ids that were never in the previous list', () => {
    expect(mergeLingering([item(1)], [item(1)], new Set([9]))).toHaveLength(1)
  })

  it('clamps to the end when the list got shorter', () => {
    const merged = mergeLingering([item(1), item(2), item(3)], [item(1)], new Set([3]))
    expect(merged.map((i) => i.id)).toEqual([1, 3])
  })
})

describe('noResultsCopy', () => {
  it('repeats the query and offers Clear search', () => {
    expect(noResultsCopy({ query: 'clay', filterCount: 0, starred: false })).toMatchObject({
      title: 'No mockups match “clay”',
      clearLabel: 'Clear search'
    })
  })

  it('offers Clear filters when only filters are on', () => {
    expect(noResultsCopy({ query: '', filterCount: 2, starred: false }).clearLabel).toBe('Clear filters')
  })

  it('offers Clear search and filters when both are on', () => {
    const copy = noResultsCopy({ query: ' clay ', filterCount: 1, starred: false })
    expect(copy.clearLabel).toBe('Clear search and filters')
    expect(copy.title).toContain('“clay”')
  })

  it('an empty Starred explains how to star, with no button', () => {
    const copy = noResultsCopy({ query: '', filterCount: 0, starred: true })
    expect(copy.title).toBe('Nothing starred yet')
    expect(copy.clearLabel).toBeNull()
  })

  it('never says the library is empty', () => {
    for (const input of [
      { query: 'x', filterCount: 0, starred: false },
      { query: '', filterCount: 1, starred: false },
      { query: 'x', filterCount: 1, starred: true }
    ]) {
      const copy = noResultsCopy(input)
      expect(`${copy.title} ${copy.description}`).not.toMatch(/empty|library is/i)
    }
  })
})

describe('planDrop', () => {
  it('a card on a card starts a pile with the target on top', () => {
    expect(planDrop([item(1)], item(2))).toEqual({ kind: 'create', memberIds: [2, 1], topId: 2 })
  })

  it('a selection on a card makes one pile, target on top', () => {
    expect(planDrop([item(1), item(3), item(4)], item(2))).toEqual({
      kind: 'create',
      memberIds: [2, 1, 3, 4],
      topId: 2
    })
  })

  it('cards on a pile join it', () => {
    expect(planDrop([item(1), item(3)], pile(2))).toEqual({ kind: 'add', pileId: 2, memberIds: [1, 3] })
  })

  it('a pile on a pile merges, and so does a selection holding a pile', () => {
    expect(planDrop([pile(1)], pile(2))).toEqual({ kind: 'merge', sourceIds: [1], targetId: 2 })
    expect(planDrop([item(3), pile(1)], pile(2))).toEqual({
      kind: 'merge',
      sourceIds: [3, 1],
      targetId: 2
    })
  })

  it('dropping on yourself does nothing, and the target is never its own member', () => {
    expect(planDrop([item(2)], item(2))).toBeNull()
    expect(planDrop([item(2), item(1)], item(2))).toEqual({ kind: 'create', memberIds: [2, 1], topId: 2 })
  })
})

describe('dropHint', () => {
  it('names what the drop will do', () => {
    expect(dropHint([item(1)], item(2))).toBe('Start a pile')
    expect(dropHint([item(1), item(3), item(4)], item(2))).toBe('New pile from 4 mockups')
    expect(dropHint([item(1)], pile(2))).toBe('Add to this pile')
    expect(dropHint([pile(1)], pile(2))).toBe('Merge into this pile')
  })
})

describe('planNewPile', () => {
  it('needs two or more', () => {
    expect(planNewPile([])).toBeNull()
    expect(planNewPile([item(1)])).toBeNull()
  })

  it('puts the first selected card on top', () => {
    expect(planNewPile([item(5), item(2), item(9)])).toEqual({
      kind: 'create',
      memberIds: [5, 2, 9],
      topId: 5
    })
  })

  it('merges into the first card when a pile is selected', () => {
    expect(planNewPile([pile(5), item(2)])).toEqual({ kind: 'merge', sourceIds: [2], targetId: 5 })
  })
})

describe('pilesIn / draggedItems', () => {
  const all = [item(1), pile(2), item(3), item(4)]

  it('finds the piles in a selection', () => {
    expect(pilesIn(all).map((i) => i.id)).toEqual([2])
  })

  it('a drag from inside the selection carries the whole selection, in grid order', () => {
    expect(draggedItems(all, ['1', '3'], 3).map((i) => i.id)).toEqual([1, 3])
  })

  it('a drag from outside the selection carries only that card', () => {
    expect(draggedItems(all, ['1', '3'], 4).map((i) => i.id)).toEqual([4])
  })
})
