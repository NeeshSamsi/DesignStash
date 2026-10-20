import { z } from 'zod'
import { StashResultSchema, StashSnapshotSchema } from '../approval'
import { IPC_CHANNELS } from '../ipc-channels'

/** One mockup's place in a pile. A snapshot of these brings a pile back (Undo). */
export const PileRowSchema = z.object({
  id: z.number(),
  isGroup: z.boolean(),
  groupId: z.number().nullable()
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
    response: PileChangeSchema
  },
  [IPC_CHANNELS.PILE_ADD]: {
    request: z.object({ pileId: z.number(), memberIds: z.array(z.number()).min(1) }),
    response: PileChangeSchema
  },
  [IPC_CHANNELS.PILE_MERGE]: {
    request: z.object({ sourceIds: z.array(z.number()).min(1), targetId: z.number() }),
    response: PileChangeSchema
  },
  [IPC_CHANNELS.PILE_SET_TOP]: {
    request: z.object({ pileId: z.number(), topId: z.number() }),
    response: PileChangeSchema
  },
  [IPC_CHANNELS.PILE_DISBAND]: {
    request: z.object({ pileId: z.number() }),
    response: z.object({
      snapshot: PileSnapshotSchema,
      /** Every mockup that is now on its own, the old top included. */
      freedIds: z.array(z.number())
    })
  },
  [IPC_CHANNELS.PILE_REMOVE]: {
    request: z.object({ pileId: z.number(), mockupId: z.number() }),
    response: z.object({
      /** The pile's id afterwards (the next mockup when the top left); null when it is no longer a pile. */
      pileId: z.number().nullable(),
      snapshot: PileSnapshotSchema,
      /** The mockups that are now on their own: the one removed, and the last one when the pile dissolved. */
      freedIds: z.array(z.number())
    })
  },
  [IPC_CHANNELS.PILE_RESTORE]: {
    request: z.object({ snapshot: PileSnapshotSchema }),
    response: z.object({ restoredIds: z.array(z.number()) })
  },
  /** Look it over: commit a whole pile from its drafts, all or nothing. */
  [IPC_CHANNELS.PILE_STASH]: {
    request: z.object({ pileId: z.number() }),
    response: StashResultSchema
  },
  /** Look it over: stash a mockup that stands on its own. */
  [IPC_CHANNELS.MOCKUP_STASH]: {
    request: z.object({ mockupId: z.number() }),
    response: StashResultSchema
  },
  [IPC_CHANNELS.PILE_UNSTASH]: {
    request: z.object({ snapshot: StashSnapshotSchema }),
    response: z.object({ restoredIds: z.array(z.number()) })
  }
} as const
