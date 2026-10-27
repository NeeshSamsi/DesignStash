import {
  ArrowUp01Icon,
  CheckListIcon,
  Delete02Icon,
  FolderTransferIcon,
  GitMergeIcon,
  Layers01Icon,
  Logout01Icon,
  UndoIcon
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { mockupCountLabel } from '@shared/pile-title'
import {
  canDisband,
  canNewPile,
  canPutOnTop,
  canTakeOut,
  getPile,
  moveTargets,
  pileOf,
  titleOfPile,
  undoLabel,
  type BoardAction,
  type BoardState
} from './board-model'

// The one menu behind a tile's ⋯, a right-click on a tile or selection, a pile, and empty board
// space (Figma S4.1 to S4.E5, S7.E3, S7.E4, S8.1). Pure: the screen draws the rows.

export type MenuTarget =
  | { kind: 'tile'; tileId: number }
  | { kind: 'pile'; pileId: string }
  | { kind: 'board' }

export interface SubItem {
  key: string
  label: string
  action: BoardAction
}

export type MenuRow =
  | {
      type: 'item'
      key: string
      label: string
      icon: IconSvgElement
      shortcut?: string
      disabled?: boolean
      /** Why it is disabled, in a few words; the row shows it after its label. */
      reason?: string
      destructive?: boolean
      action: BoardAction
    }
  | {
      type: 'sub'
      key: string
      label: string
      icon: IconSvgElement
      disabled?: boolean
      reason?: string
      items: SubItem[]
    }
  | { type: 'divider' }

const item = (row: Omit<Extract<MenuRow, { type: 'item' }>, 'type'>): MenuRow => ({
  type: 'item',
  ...row
})
const divider: MenuRow = { type: 'divider' }

/** `disabled` with its reason, or nothing when `why` is null. */
const unless = (why: string | null) => (why === null ? {} : { disabled: true, reason: why })

/** Why Put on top can't run on the selection, or null when it can. */
function putOnTopBlock(state: BoardState): string | null {
  if (canPutOnTop(state)) return null
  const [only] = state.selectedTiles
  if (state.selectedTiles.length !== 1 || only === undefined) return 'one at a time'
  return pileOf(state, only) ? 'already on top' : 'not in a pile'
}

/** Why New pile can't run on the selection, or null when it can. */
const newPileBlock = (state: BoardState) =>
  canNewPile(state) ? null : state.selectedTiles.length < 2 ? 'needs 2 or more' : 'already a pile'

/** The Move to ▸ destinations: every pile that doesn't already hold the lot, On its own, New pile. */
function moveItems(state: BoardState): SubItem[] {
  const targets = moveTargets(state)
  return [
    ...targets.piles.map((p) => ({
      key: `pile:${p.pileId}`,
      label: `${p.title} · ${p.count}`,
      action: { type: 'move-to', destination: { kind: 'pile', pileId: p.pileId } } as BoardAction
    })),
    ...(targets.standalone
      ? [
          {
            key: 'standalone',
            label: 'On its own',
            action: { type: 'move-to', destination: { kind: 'standalone' } } as BoardAction
          }
        ]
      : []),
    ...(targets.newPile
      ? [
          {
            key: 'new-pile',
            label: 'New pile',
            action: {
              type: 'move-to',
              destination: { kind: 'new-pile' }
            } as BoardAction
          }
        ]
      : [])
  ]
}

function tileRows(state: BoardState): MenuRow[] {
  const n = state.selectedTiles.length
  const moves = moveItems(state)
  const move: MenuRow = {
    type: 'sub',
    key: 'move',
    label: n > 1 ? `Move ${n} to` : 'Move to',
    icon: FolderTransferIcon,
    // With nothing in a pile, Move to only has piles to offer, and there are none.
    ...unless(moves.length === 0 ? 'no piles yet' : null),
    items: moves
  }
  const takeOut = item({
    key: 'take-out',
    label: n > 1 ? `Take ${n} out of piles` : 'Take out of pile',
    icon: Logout01Icon,
    ...unless(canTakeOut(state) ? null : n > 1 ? 'none in a pile' : 'not in a pile'),
    action: { type: 'take-out' }
  })
  const putOnTop = item({
    key: 'put-on-top',
    label: 'Put on top',
    icon: ArrowUp01Icon,
    ...unless(putOnTopBlock(state)),
    action: { type: 'put-on-top' }
  })
  const newPile = item({
    key: 'new-pile',
    label: n > 1 ? `New pile from ${mockupCountLabel(n)}` : 'New pile',
    icon: Layers01Icon,
    shortcut: '⌘G',
    ...unless(newPileBlock(state)),
    action: { type: 'new-pile' }
  })
  // With several tiles, making a pile leads (S4.2). With one it can't be made, so it comes last (S4.1).
  return n > 1
    ? [newPile, divider, putOnTop, move, takeOut]
    : [putOnTop, move, takeOut, divider, newPile]
}

function pileRows(state: BoardState): MenuRow[] {
  const chosen = state.selectedPiles
  const disband = item({
    key: 'disband',
    label: chosen.length > 1 ? `Disband ${chosen.length} piles` : 'Disband pile',
    icon: Delete02Icon,
    shortcut: '⇧⌘G',
    destructive: true,
    ...unless(canDisband(state) ? null : 'no pile picked'),
    action: { type: 'disband' }
  })
  if (chosen.length > 1) {
    return [
      item({
        key: 'merge',
        label: `Merge ${chosen.length} piles`,
        icon: GitMergeIcon,
        action: { type: 'merge', targetId: chosen[0]! }
      }),
      divider,
      disband
    ]
  }
  const only = chosen[0]
  const others = state.piles.filter((p) => p.id !== only)
  return [
    item({
      key: 'select-all',
      label: 'Select all in pile',
      icon: CheckListIcon,
      action: { type: 'select-pile-tiles', pileId: only ?? '' }
    }),
    {
      type: 'sub',
      key: 'merge-into',
      label: 'Merge into',
      icon: GitMergeIcon,
      ...unless(others.length === 0 ? 'no other piles' : null),
      items: others.map((p) => ({
        key: p.id,
        label: `${titleOfPile(state, getPile(state, p.id)!).title} · ${p.memberIds.length}`,
        action: { type: 'merge', targetId: p.id, sourceIds: only ? [only] : [] } as BoardAction
      }))
    },
    divider,
    disband
  ]
}

function boardRows(state: BoardState): MenuRow[] {
  const last = undoLabel(state)
  return [
    item({
      key: 'select-all',
      label: 'Select all',
      icon: CheckListIcon,
      shortcut: '⌘A',
      action: { type: 'select-all' }
    }),
    item({
      key: 'undo',
      label: last ? `Undo ${last}` : 'Undo',
      icon: UndoIcon,
      shortcut: '⌘Z',
      ...unless(last === null ? 'nothing to undo' : null),
      action: { type: 'undo' }
    })
  ]
}

/**
 * The rows for a menu. Open it after the board has applied the right-click, so the selection
 * already says what the menu acts on (`context-tile` or `context-pile`).
 */
export function buildMenu(state: BoardState, target: MenuTarget): MenuRow[] {
  switch (target.kind) {
    case 'tile':
      return tileRows(state)
    case 'pile':
      return pileRows(state)
    case 'board':
      return boardRows(state)
  }
}
