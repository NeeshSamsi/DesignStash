import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  EMPTY_SELECTION,
  selectionReducer,
  useGridSelection,
  type SelectionAction,
  type SelectionState
} from './use-grid-selection'

const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

const run = (state: SelectionState, ...actions: SelectionAction[]) =>
  actions.reduce((current, action) => selectionReducer(current, action, ids), state)

describe('selectionReducer', () => {
  it('click selects one card and replaces the selection', () => {
    const state = run(EMPTY_SELECTION, { type: 'click', id: 'b' }, { type: 'click', id: 'd' })
    expect(state.selected).toEqual(['d'])
    expect(state.anchor).toBe('d')
  })

  it('click ignores an id that is not in the grid, such as the Add card', () => {
    const state = run(EMPTY_SELECTION, { type: 'click', id: 'add-card' })
    expect(state).toBe(EMPTY_SELECTION)
  })

  it('⌘-click adds and removes a card, keeping grid order', () => {
    const state = run(
      EMPTY_SELECTION,
      { type: 'click', id: 'd' },
      { type: 'toggle', id: 'b' },
      { type: 'toggle', id: 'f' }
    )
    expect(state.selected).toEqual(['b', 'd', 'f'])
    expect(run(state, { type: 'toggle', id: 'd' }).selected).toEqual(['b', 'f'])
  })

  it('⇧-click selects the range from the anchor in grid order, either direction', () => {
    const forward = run(EMPTY_SELECTION, { type: 'click', id: 'b' }, { type: 'range', id: 'e' })
    expect(forward.selected).toEqual(['b', 'c', 'd', 'e'])
    const backward = run(forward, { type: 'range', id: 'a' })
    expect(backward.selected).toEqual(['a', 'b'])
    expect(backward.anchor).toBe('b')
  })

  it('⇧-click with no anchor selects just that card', () => {
    expect(run(EMPTY_SELECTION, { type: 'range', id: 'c' }).selected).toEqual(['c'])
  })

  it('marquee replaces the selection, or adds to the starting selection with ⌘', () => {
    const base = ['a']
    const replaced = run(EMPTY_SELECTION, {
      type: 'marquee',
      hits: ['c', 'b'],
      base,
      additive: false
    })
    expect(replaced.selected).toEqual(['b', 'c'])
    const added = run(EMPTY_SELECTION, { type: 'marquee', hits: ['c', 'b'], base, additive: true })
    expect(added.selected).toEqual(['a', 'b', 'c'])
  })

  it('marquee drops hits that are not in the grid', () => {
    const state = run(EMPTY_SELECTION, {
      type: 'marquee',
      hits: ['add-card', 'b'],
      base: [],
      additive: false
    })
    expect(state.selected).toEqual(['b'])
  })

  it('⌘A selects every id and Esc clears', () => {
    const all = run(EMPTY_SELECTION, { type: 'select-all' })
    expect(all.selected).toEqual(ids)
    expect(run(all, { type: 'clear' })).toEqual(EMPTY_SELECTION)
  })

  describe('arrow keys', () => {
    const move = (direction: 'left' | 'right' | 'up' | 'down', extend = false) =>
      ({ type: 'move', direction, extend, columns: 3 }) as const

    it('land on the first card when nothing is under the cursor', () => {
      expect(run(EMPTY_SELECTION, move('right')).selected).toEqual(['a'])
      expect(run(EMPTY_SELECTION, move('down')).selected).toEqual(['a'])
    })

    it('move by one across and by a row up and down', () => {
      const start = run(EMPTY_SELECTION, { type: 'click', id: 'b' })
      expect(run(start, move('right')).selected).toEqual(['c'])
      expect(run(start, move('left')).selected).toEqual(['a'])
      expect(run(start, move('down')).selected).toEqual(['e'])
      expect(run(run(start, move('down')), move('up')).selected).toEqual(['b'])
    })

    it('stop at the first and last cards', () => {
      expect(run(run(EMPTY_SELECTION, { type: 'click', id: 'a' }), move('left')).selected).toEqual([
        'a'
      ])
      expect(run(run(EMPTY_SELECTION, { type: 'click', id: 'g' }), move('down')).selected).toEqual([
        'g'
      ])
    })

    it('⇧ extends from the anchor and shrinks back through it', () => {
      const start = run(EMPTY_SELECTION, { type: 'click', id: 'b' })
      const extended = run(start, move('right', true), move('right', true))
      expect(extended.selected).toEqual(['b', 'c', 'd'])
      expect(extended.anchor).toBe('b')
      expect(run(extended, move('left', true)).selected).toEqual(['b', 'c'])
      expect(run(extended, move('down', true)).selected).toEqual(['b', 'c', 'd', 'e', 'f', 'g'])
    })
  })

  it('set keeps only known ids, in grid order', () => {
    expect(run(EMPTY_SELECTION, { type: 'set', selected: ['d', 'ghost', 'a'] }).selected).toEqual([
      'a',
      'd'
    ])
  })
})

describe('useGridSelection', () => {
  it('maps modifiers to click, toggle and range', () => {
    const { result } = renderHook(() => useGridSelection(ids))
    act(() => result.current.select('b'))
    act(() => result.current.select('d', { metaKey: true }))
    expect(result.current.selectedIds).toEqual(['b', 'd'])
    act(() => result.current.select('f', { shiftKey: true }))
    expect(result.current.selectedIds).toEqual(['d', 'e', 'f'])
    expect(result.current.isSelected('e')).toBe(true)
    expect(result.current.count).toBe(3)
  })

  it('treats ctrl like ⌘', () => {
    const { result } = renderHook(() => useGridSelection(ids))
    act(() => result.current.select('a'))
    act(() => result.current.select('c', { ctrlKey: true }))
    expect(result.current.selectedIds).toEqual(['a', 'c'])
  })

  it('selects all, then clears', () => {
    const { result } = renderHook(() => useGridSelection(ids))
    act(() => result.current.selectAll())
    expect(result.current.count).toBe(ids.length)
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  it('drops ids that leave the grid', () => {
    const { result, rerender } = renderHook(({ list }) => useGridSelection(list), {
      initialProps: { list: ids }
    })
    act(() => result.current.select('c'))
    act(() => result.current.select('e', { metaKey: true }))
    rerender({ list: ids.filter((id) => id !== 'c') })
    expect(result.current.selectedIds).toEqual(['e'])
  })
})
