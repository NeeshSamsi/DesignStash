import type { DiscardedEdit, RendererUndoOp, UndoContext, UndoState } from '@shared/ipc/undo'
import type { PendingStash, SettingsStore } from '../settings'
import { undoMenuItems, type UndoMenuItems } from './menu-items'
import type { DataOp } from './ops'
import { UndoHistory, type OpOutcome, type OpRunner, type UndoRecord } from './undo-history'

/**
 * Every op the app's history runs: data's, on the library's rows, and two of its own: a step the
 * window carries out (Discard your changes) and the stash folder change waiting for a restart.
 */
export type AppOp =
  | DataOp
  | { kind: 'renderer'; payload: RendererUndoOp }
  | { kind: 'pending-stash'; payload: { pendingStash: PendingStash | null } }

export interface UndoService {
  history: UndoHistory<AppOp>
  /** Records an action. An action that changed nothing (`null`) records nothing. Returns the entry's id. */
  record(record: UndoRecord<AppOp> | null): number | undefined
  /** Discard your changes: the history keeps the values, and hands them back to the window. */
  recordDiscard(mockupId: number, values: DiscardedEdit): number
  /** A stash folder change waiting for the restart, from `before` to `after`. */
  pendingStashRecord(before: PendingStash | null, after: PendingStash | null): UndoRecord<AppOp>
  /** Where ⌘Z lands now, as the window reports it, for the Edit menu's labels. */
  setContext(context: UndoContext): void
  /** A focused field's own undo or redo, through the window. */
  editField(direction: 'undo' | 'redo'): void
}

/** Every mockup in the piles (or singles) of `ids`, once each: an action's scope. */
export function pilesOf(scopes: { pile(id: number): number[] }, ids: number[]): number[] {
  return [...new Set(ids.flatMap((id) => scopes.pile(id)))]
}

/** The id an undoable reply carries (`undoEntryId`), or nothing when no entry was recorded. */
export function undoEntry(id: number | undefined): { undoEntryId?: number } {
  return id === undefined ? {} : { undoEntryId: id }
}

export interface UndoServiceDeps {
  /** Runs data's ops (ops/index.ts). */
  data: OpRunner<DataOp>
  settings: SettingsStore
  /** Sends the undo:state push. */
  push: (state: UndoState) => void
  /** Puts new labels on Edit › Undo and Redo. */
  menu: (items: UndoMenuItems) => void
  editField: (direction: 'undo' | 'redo') => void
}

/**
 * The app's undo history with everything around it (design/specs/undo.md): the runner for every op
 * kind, the undo:state push and the Edit menu's labels after each change, and the context the
 * window reports.
 */
export function createUndoService(deps: UndoServiceDeps): UndoService {
  let context: UndoContext = 'app'

  const runner: OpRunner<AppOp> = {
    run(op): OpOutcome | Promise<OpOutcome> {
      switch (op.kind) {
        case 'renderer':
          return { ok: true, renderer: op.payload }
        case 'pending-stash':
          deps.settings.update({ pendingStash: op.payload.pendingStash })
          return { ok: true }
        default:
          return deps.data.run(op)
      }
    }
  }

  const refreshMenu = (): void => deps.menu(undoMenuItems(context, history.state()))

  const changed = (): void => {
    const { undo, redo, entries } = history.state()
    deps.push({
      // A toast's out-of-order undo has no name of its own to show: ⌘Z puts that action back.
      ...(undo && !undo.reversal ? { undoLabel: undo.label } : {}),
      ...(redo ? { redoLabel: redo.label } : {}),
      entries
    })
    refreshMenu()
  }

  const history = new UndoHistory<AppOp>(runner, { onChange: changed })

  return {
    history,
    record: (record) => (record ? history.record(record) : undefined),
    recordDiscard: (mockupId, values) =>
      history.record({
        label: 'Discard changes',
        undo: { kind: 'renderer', payload: { kind: 'reopen-editor', mockupId, values } },
        redo: { kind: 'renderer', payload: { kind: 'discard-editor', mockupId } },
        targets: [{ kind: 'mockup', id: mockupId }]
      }),
    pendingStashRecord: (before, after) => ({
      label: (after ?? before)?.mode === 'point' ? 'Change stash folder' : 'Move stash folder',
      undo: { kind: 'pending-stash', payload: { pendingStash: before } },
      redo: { kind: 'pending-stash', payload: { pendingStash: after } },
      targets: []
    }),
    setContext(next) {
      context = next
      refreshMenu()
    },
    editField: deps.editField
  }
}
