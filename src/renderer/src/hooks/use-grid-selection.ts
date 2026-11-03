import { useCallback, useMemo, useReducer } from 'react'

/**
 * Selection for a grid of cards (My Stash, To sort, To stash, Trash). The reducer is pure.
 * `ids` is every selectable id in grid order. The Add card is not in it, so it can never be selected.
 */
export interface SelectionState {
  /** Selected ids, always in grid order. */
  selected: readonly string[]
  /** Where ⇧-click and ⇧-arrow ranges start. */
  anchor: string | null
  /** The card arrow keys move from. */
  cursor: string | null
}

export type Direction = 'left' | 'right' | 'up' | 'down'

export type SelectionAction =
  | { type: 'click'; id: string }
  | { type: 'toggle'; id: string }
  | { type: 'range'; id: string }
  /** `base` is the selection when the drag began; it is kept only when ⌘ is held. */
  | { type: 'marquee'; hits: readonly string[]; base: readonly string[]; additive: boolean }
  | { type: 'select-all' }
  | { type: 'clear' }
  | { type: 'move'; direction: Direction; extend: boolean; columns: number }
  | { type: 'set'; selected: readonly string[] }

export const EMPTY_SELECTION: SelectionState = { selected: [], anchor: null, cursor: null }

/** Keeps `picked` in grid order and drops anything not in the grid. */
function inGridOrder(ids: readonly string[], picked: Iterable<string>): string[] {
  const wanted = new Set(picked)
  return ids.filter((id) => wanted.has(id))
}

function rangeBetween(ids: readonly string[], a: string, b: string): string[] {
  const from = ids.indexOf(a)
  const to = ids.indexOf(b)
  if (from === -1 || to === -1) return []
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1)
}

function step(direction: Direction, columns: number): number {
  switch (direction) {
    case 'left':
      return -1
    case 'right':
      return 1
    case 'up':
      return -columns
    case 'down':
      return columns
  }
}

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
  ids: readonly string[]
): SelectionState {
  switch (action.type) {
    case 'click':
      if (!ids.includes(action.id)) return state
      return { selected: [action.id], anchor: action.id, cursor: action.id }

    case 'toggle': {
      if (!ids.includes(action.id)) return state
      const selected = state.selected.includes(action.id)
        ? state.selected.filter((id) => id !== action.id)
        : inGridOrder(ids, [...state.selected, action.id])
      return { selected, anchor: action.id, cursor: action.id }
    }

    case 'range': {
      if (!ids.includes(action.id)) return state
      const anchor = state.anchor && ids.includes(state.anchor) ? state.anchor : action.id
      return { selected: rangeBetween(ids, anchor, action.id), anchor, cursor: action.id }
    }

    case 'marquee': {
      const kept = action.additive ? action.base : []
      const selected = inGridOrder(ids, [...kept, ...action.hits])
      const last = selected.at(-1) ?? null
      return { selected, anchor: last ?? state.anchor, cursor: last ?? state.cursor }
    }

    case 'select-all':
      return {
        selected: [...ids],
        anchor: ids[0] ?? null,
        cursor: ids.at(-1) ?? null
      }

    case 'clear':
      return { selected: [], anchor: null, cursor: null }

    case 'move': {
      if (ids.length === 0) return state
      const from = state.cursor ? ids.indexOf(state.cursor) : -1
      // With nothing under the cursor yet, any arrow lands on the first card.
      const next =
        from === -1
          ? 0
          : Math.min(ids.length - 1, Math.max(0, from + step(action.direction, action.columns)))
      const cursor = ids[next]
      if (cursor === undefined) return state
      if (!action.extend) return { selected: [cursor], anchor: cursor, cursor }
      const anchor = state.anchor && ids.includes(state.anchor) ? state.anchor : cursor
      return { selected: rangeBetween(ids, anchor, cursor), anchor, cursor }
    }

    case 'set': {
      const selected = inGridOrder(ids, action.selected)
      const last = selected.at(-1) ?? null
      return { selected, anchor: last, cursor: last }
    }
  }
}

export interface ClickModifiers {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

export interface GridSelection {
  /** Every selectable id in grid order. */
  ids: readonly string[]
  selected: ReadonlySet<string>
  /** Selected ids in grid order. */
  selectedIds: readonly string[]
  cursor: string | null
  count: number
  isSelected: (id: string) => boolean
  /** Click, ⌘-click (toggle) or ⇧-click (range), by the modifiers held. */
  select: (id: string, modifiers?: ClickModifiers) => void
  /** Live marquee result. `base` is the selection when the drag began. */
  marquee: (hits: readonly string[], base: readonly string[], additive: boolean) => void
  move: (direction: Direction, extend: boolean, columns: number) => void
  selectAll: () => void
  clear: () => void
  set: (ids: readonly string[]) => void
}

/** Wires the pure reducer to a grid. Ids that leave the grid drop out of the selection. */
export function useGridSelection(ids: readonly string[]): GridSelection {
  const [state, dispatch] = useReducer(
    (current: SelectionState, action: SelectionAction & { ids: readonly string[] }) =>
      selectionReducer(current, action, action.ids),
    EMPTY_SELECTION
  )

  const idKey = ids.join('\u0000')
  const idList = useMemo(() => ids, [idKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = useMemo(() => {
    const present = new Set(idList)
    return state.selected.filter((id) => present.has(id))
  }, [state.selected, idList])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const run = useCallback(
    (action: SelectionAction) => dispatch({ ...action, ids: idList }),
    [idList]
  )

  return useMemo(
    () => ({
      ids: idList,
      selected,
      selectedIds,
      cursor: state.cursor,
      count: selectedIds.length,
      isSelected: (id) => selected.has(id),
      select: (id, modifiers = {}) => {
        if (modifiers.metaKey || modifiers.ctrlKey) run({ type: 'toggle', id })
        else if (modifiers.shiftKey) run({ type: 'range', id })
        else run({ type: 'click', id })
      },
      marquee: (hits, base, additive) => run({ type: 'marquee', hits, base, additive }),
      move: (direction, extend, columns) => run({ type: 'move', direction, extend, columns }),
      selectAll: () => run({ type: 'select-all' }),
      clear: () => run({ type: 'clear' }),
      set: (next) => run({ type: 'set', selected: next })
    }),
    [idList, selected, selectedIds, state.cursor, run]
  )
}
