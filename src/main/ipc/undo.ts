import { IPC_CHANNELS } from '@shared/ipc'
import type { UndoRunResult } from '@shared/ipc/undo'
import type { HandlerContext } from './context'
import { countsChanged } from './library-effects'
import { registerIpcHandler } from './register'

/**
 * The app's undo history (design/specs/undo.md): ⌘Z and ⇧⌘Z outside a field or flow, a toast's
 * own Undo, where ⌘Z lands now, a field's own undo through the window, and Discard your changes.
 */
export function registerUndoHandlers(ctx: Pick<HandlerContext, 'undo' | 'repo' | 'push'>): void {
  const { undo } = ctx
  /** A step that ran may have moved mockups between the inboxes, Trash and My Stash. */
  const ran = (result: UndoRunResult): UndoRunResult => {
    if (result.status === 'done' || result.status === 'dropped') countsChanged(ctx)
    return result
  }

  registerIpcHandler(IPC_CHANNELS.UNDO_RUN, async () => ran(await undo.history.undo()))
  registerIpcHandler(IPC_CHANNELS.REDO_RUN, async () => ran(await undo.history.redo()))
  registerIpcHandler(IPC_CHANNELS.UNDO_ENTRY, async ({ id }) =>
    ran(await undo.history.undoEntry(id))
  )
  registerIpcHandler(IPC_CHANNELS.UNDO_CONTEXT, ({ context }) => undo.setContext(context))
  registerIpcHandler(IPC_CHANNELS.UNDO_FIELD, ({ direction }) => undo.editField(direction))
  registerIpcHandler(IPC_CHANNELS.UNDO_RECORD_DISCARD, ({ mockupId, values }) => ({
    undoEntryId: undo.recordDiscard(mockupId, values)
  }))
}
