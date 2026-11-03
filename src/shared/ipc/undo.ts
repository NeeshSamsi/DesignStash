import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/**
 * Where ⌘Z lands (design/specs/undo.md, "The rule"): a focused text field, an open flow (Sort or
 * Look it over) with focus outside a field, or the app's history.
 */
export const UndoContextSchema = z.enum(['app', 'field', 'flow'])
export type UndoContext = z.infer<typeof UndoContextSchema>

/** The id of the history entry an action recorded. */
export const UndoEntryIdSchema = z.number().int()

/**
 * An undoable action's response, with the id of the history entry it recorded, so its toast can
 * undo that entry on its own (undo:entry). Absent when nothing was recorded: nothing changed, or
 * the action failed.
 */
export function withUndoEntry<T extends z.ZodType>(response: T) {
  return response.and(z.object({ undoEntryId: UndoEntryIdSchema.optional() }))
}

/**
 * What the Details editor held when the person discarded it (Discard your changes), as its fields
 * were: the same fields mockup:update saves.
 */
export const DiscardedEditSchema = z.object({
  title: z.string(),
  description: z.string(),
  tagIds: z.array(z.number()),
  variation: z.string().optional()
})
export type DiscardedEdit = z.infer<typeof DiscardedEditSchema>

/**
 * A step main hands back for the renderer to carry out, for an entry only the renderer can act on.
 * Discard your changes: undo reopens the editor for that mockup with the discarded values; redo
 * discards them again.
 */
export const RendererUndoOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reopen-editor'), mockupId: z.number(), values: DiscardedEditSchema }),
  z.object({ kind: z.literal('discard-editor'), mockupId: z.number() })
])
export type RendererUndoOp = z.infer<typeof RendererUndoOpSchema>

/** What an undo or redo did. */
export const UndoRunResultSchema = z.discriminatedUnion('status', [
  /**
   * The action named by `label` ("Move to Trash") was undone or redone. `renderer` is set for an
   * entry the renderer carries out itself.
   */
  z.object({
    status: z.literal('done'),
    label: z.string(),
    renderer: RendererUndoOpSchema.optional()
  }),
  /** Nothing to undo or redo. */
  z.object({ status: z.literal('empty') }),
  /**
   * The step couldn't run, because what it acts on was deleted for good, and it's gone from the
   * history. The toast reads "Couldn't undo {label}: {reason}".
   */
  z.object({ status: z.literal('dropped'), label: z.string(), reason: z.string() }),
  /**
   * undo:entry only: a newer action touched the same mockups, piles, tags or covers, so this one
   * can't be undone on its own. `blockedBy` is the newest such entry.
   */
  z.object({ status: z.literal('blocked'), label: z.string(), blockedBy: z.number().int() }),
  /** undo:entry only: the entry isn't in the history any more (undone, or dropped). */
  z.object({ status: z.literal('gone') })
])
export type UndoRunResult = z.infer<typeof UndoRunResultSchema>

/** One entry a toast may still be showing, and whether its own Undo is allowed. */
export const UndoEntryStateSchema = z.object({
  id: z.number().int(),
  /** Set when a newer action touched the same things: the toast's Undo is disabled. */
  blockedBy: z.number().int().optional()
})

/**
 * The undo:state push, after every change to the history. The labels name the next undo and redo
 * ("Move to Trash"); the window and the Edit menu put "Undo" or "Redo" in front.
 */
export const UndoStateSchema = z.object({
  undoLabel: z.string().optional(),
  redoLabel: z.string().optional(),
  entries: z.array(UndoEntryStateSchema)
})
export type UndoState = z.infer<typeof UndoStateSchema>

/** The app's undo history, and the route a field's own undo takes when the renderer can't do it. */
export const undoContract = {
  /** ⌘Z or Edit › Undo outside a field or flow: the app's last action. */
  [IPC_CHANNELS.UNDO_RUN]: { request: z.void(), response: UndoRunResultSchema },
  /** ⇧⌘Z or Edit › Redo outside a field or flow. */
  [IPC_CHANNELS.REDO_RUN]: { request: z.void(), response: UndoRunResultSchema },
  /**
   * A toast's Undo: that entry alone, out of order when no newer action touched the same things.
   * The out-of-order undo is recorded as a new action.
   */
  [IPC_CHANNELS.UNDO_ENTRY]: {
    request: z.object({ id: z.number().int() }),
    response: UndoRunResultSchema
  },
  /** The renderer reports where ⌘Z lands now, so the Edit menu says plain "Undo" in a field or flow. */
  [IPC_CHANNELS.UNDO_CONTEXT]: {
    request: z.object({ context: UndoContextSchema }),
    response: z.void()
  },
  /** A focused field's own undo or redo, through the window's webContents. */
  [IPC_CHANNELS.UNDO_FIELD]: {
    request: z.object({ direction: z.enum(['undo', 'redo']) }),
    response: z.void()
  },
  /**
   * Discard your changes, which happens in the renderer: the history keeps the discarded values,
   * and undo:run hands them back as a reopen-editor op.
   */
  [IPC_CHANNELS.UNDO_RECORD_DISCARD]: {
    request: z.object({ mockupId: z.number(), values: DiscardedEditSchema }),
    response: z.object({ undoEntryId: UndoEntryIdSchema })
  }
} as const
