import { z } from 'zod'
import { StashResultSchema, StashSnapshotSchema } from '../approval'
import { IPC_CHANNELS } from '../ipc-channels'
import { LibraryItemSchema } from '../library'
import { VariationSchema, VariationSourceSchema } from '../pile-variation'
import { withUndoEntry } from './undo'

/**
 * One mockup's place in a pile, and its titles, which joining or leaving a pile changes. A snapshot
 * of these brings a pile back (Undo). The titles are left out of snapshots from before base titles.
 */
export const PileRowSchema = z.object({
  id: z.number(),
  isGroup: z.boolean(),
  groupId: z.number().nullable(),
  title: z.string().optional(),
  variation: z.string().nullable().optional(),
  variationSource: VariationSourceSchema.nullable().optional()
})
export type PileRow = z.infer<typeof PileRowSchema>

/** The state of every mockup a pile action touched, from before the action. */
export const PileSnapshotSchema = z.object({ rows: z.array(PileRowSchema) })
export type PileSnapshot = z.infer<typeof PileSnapshotSchema>

const PileChangeSchema = z.object({
  /** The pile's id after the change (its top mockup). */
  pileId: z.number(),
  /** Pass to PILE_RESTORE to undo. */
  snapshot: PileSnapshotSchema
})

/** Piles in My Stash. Every action returns a snapshot so the renderer can offer Undo. */
export const pileContract = {
  [IPC_CHANNELS.PILE_CREATE]: {
    request: z.object({ memberIds: z.array(z.number()).min(2), topId: z.number() }),
    response: withUndoEntry(PileChangeSchema)
  },
  [IPC_CHANNELS.PILE_ADD]: {
    request: z.object({ pileId: z.number(), memberIds: z.array(z.number()).min(1) }),
    response: withUndoEntry(PileChangeSchema)
  },
  [IPC_CHANNELS.PILE_MERGE]: {
    request: z.object({ sourceIds: z.array(z.number()).min(1), targetId: z.number() }),
    response: withUndoEntry(PileChangeSchema)
  },
  [IPC_CHANNELS.PILE_SET_TOP]: {
    request: z.object({ pileId: z.number(), topId: z.number() }),
    response: withUndoEntry(PileChangeSchema)
  },
  [IPC_CHANNELS.PILE_DISBAND]: {
    request: z.object({ pileId: z.number() }),
    response: withUndoEntry(
      z.object({
        snapshot: PileSnapshotSchema,
        /** Every mockup that is now on its own, the old top included. */
        freedIds: z.array(z.number())
      })
    )
  },
  [IPC_CHANNELS.PILE_REMOVE]: {
    request: z.object({ pileId: z.number(), mockupId: z.number() }),
    response: withUndoEntry(
      z.object({
        /** The pile's id afterwards (the next mockup when the top left); null when it is no longer a pile. */
        pileId: z.number().nullable(),
        snapshot: PileSnapshotSchema,
        /** The mockups that are now on their own: the one removed, and the last one when the pile dissolved. */
        freedIds: z.array(z.number())
      })
    )
  },
  [IPC_CHANNELS.PILE_RESTORE]: {
    request: z.object({ snapshot: PileSnapshotSchema }),
    response: z.object({ restoredIds: z.array(z.number()) })
  },
  /**
   * A pile's mockups for its page, in one call: the top first, then the rest in order, each as a
   * library row with its tags and star. Empty when it is no longer a pile (or is in Trash).
   */
  [IPC_CHANNELS.PILE_MEMBERS]: {
    request: z.object({ pileId: z.number() }),
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  /**
   * Rename a pile: its base title, on every mockup in it, exactly, with no AI
   * (design/specs/pile-titles.md). Works in Look it over (on the drafts) and My Stash (Edit pile
   * details). The base is trimmed, with runs of spaces folded. Undo: rename to `previous`.
   */
  [IPC_CHANNELS.PILE_RENAME]: {
    request: z.object({ pileId: z.number(), base: z.string().trim().min(1) }),
    response: withUndoEntry(
      z.object({
        pileId: z.number(),
        /** The base as saved. */
        base: z.string(),
        /** The base before, for Undo. */
        previous: z.string(),
        /** Every mockup whose title changed. */
        mockupIds: z.array(z.number())
      })
    )
  },
  /**
   * Set one mockup's variation, in Look it over or My Stash. Typed words are kept exactly, even when
   * another mockup has them; empty words take the file marker or number back (when focus leaves an
   * emptied field). `source` is only for Undo: it puts `previous` back as it was.
   */
  [IPC_CHANNELS.PILE_SET_VARIATION]: {
    request: z.object({
      mockupId: z.number(),
      words: z.string(),
      source: VariationSourceSchema.optional()
    }),
    response: withUndoEntry(
      z.object({
        mockupId: z.number(),
        /** The variation as saved. */
        variation: VariationSchema,
        /** The variation before, for Undo. */
        previous: VariationSchema.nullable()
      })
    )
  },
  /** Look it over: commit a whole pile from its drafts, all or nothing. */
  [IPC_CHANNELS.PILE_STASH]: {
    request: z.object({ pileId: z.number() }),
    response: withUndoEntry(StashResultSchema)
  },
  /** Look it over: stash a mockup that stands on its own. */
  [IPC_CHANNELS.MOCKUP_STASH]: {
    request: z.object({ mockupId: z.number() }),
    response: withUndoEntry(StashResultSchema)
  },
  [IPC_CHANNELS.PILE_UNSTASH]: {
    request: z.object({ snapshot: StashSnapshotSchema }),
    response: z.object({ restoredIds: z.array(z.number()) })
  }
} as const
