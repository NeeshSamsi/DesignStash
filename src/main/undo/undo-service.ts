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
  /** The stash check's ignore list, as it was or as the action left it. */
  | { kind: 'ignored-drift'; payload: { ids: string[] } }
  /** A model set aside by Delete model (kept until quit): brought back, or set aside again. */
  | { kind: 'model'; payload: { id: string; action: 'restore' | 'set-aside'; makeActive: boolean } }

export interface UndoService {
  history: UndoHistory<AppOp>
  /** Records an action. An action that changed nothing (`null`) records nothing. Returns the entry's id. */
  record(record: UndoRecord<AppOp> | null): number | undefined
  /** Discard your changes: the history keeps the values, and hands them back to the window. */
  recordDiscard(mockupId: number, values: DiscardedEdit): number
  /** A stash folder change waiting for the restart, from `before` to `after`. */
  pendingStashRecord(before: PendingStash | null, after: PendingStash | null): UndoRecord<AppOp>
  /** The stash check's ignore list, from `before` to `after`. */
  ignoredDriftRecord(label: string, before: string[], after: string[]): UndoRecord<AppOp>
  /** Delete model: undo restores it (active again when it was), redo sets it aside again. */
  modelRecord(id: string, wasActive: boolean): UndoRecord<AppOp>
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
  /** A set-aside model's files: each says whether they were there. */
  models?: {
    restore(id: string, makeActive: boolean): Promise<boolean>
    setAside(id: string): Promise<boolean>
  }
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
        case 'ignored-drift':
          deps.settings.update({ ignoredDrift: op.payload.ids })
          return { ok: true }
        case 'model':
          return modelStep(op.payload)
        default:
          return deps.data.run(op)
      }
    }
  }

  const modelStep = async ({
    id,
    action,
    makeActive
  }: {
    id: string
    action: 'restore' | 'set-aside'
    makeActive: boolean
  }): Promise<OpOutcome> => {
    const models = deps.models
    const there = models
      ? action === 'restore'
        ? await models.restore(id, makeActive)
        : await models.setAside(id)
      : false
    return there ? { ok: true } : { ok: false, missing: { kind: 'model', id } }
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
    ignoredDriftRecord: (label, before, after) => ({
      label,
      undo: { kind: 'ignored-drift', payload: { ids: before } },
      redo: { kind: 'ignored-drift', payload: { ids: after } },
      targets: []
    }),
    modelRecord: (id, wasActive) => ({
      label: 'Delete model',
      undo: { kind: 'model', payload: { id, action: 'restore', makeActive: wasActive } },
      redo: { kind: 'model', payload: { id, action: 'set-aside', makeActive: false } },
      targets: [{ kind: 'model', id }]
    }),
    setContext(next) {
      context = next
      refreshMenu()
    },
    editField: deps.editField
  }
}
