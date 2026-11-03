import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { TrashItemSchema, TrashStatsSchema } from '../inbox'

/** Mockups or piles to move to Trash or bring back. */
const TrashTargetsSchema = z.object({ ids: z.array(z.number()).min(1) })

const RestoreResultSchema = z.object({
  /** Back in My Stash. Moving these to Trash again (MOCKUP_TRASH) undoes it. */
  restoredIds: z.array(z.number()),
  /** Still in Trash because a PSD in the stash folder is gone. */
  missing: z.array(z.number())
})

/** Trash. */
export const trashContract = {
  [IPC_CHANNELS.MOCKUP_TRASH]: {
    request: TrashTargetsSchema,
    response: z.object({ ok: z.boolean(), count: z.number() })
  },
  [IPC_CHANNELS.MOCKUP_RESTORE]: {
    request: TrashTargetsSchema,
    response: z.object({ ok: z.boolean(), count: z.number() })
  },
  [IPC_CHANNELS.TRASH_LIST]: {
    request: z.void(),
    response: z.object({ items: z.array(TrashItemSchema) })
  },
  [IPC_CHANNELS.TRASH_STATS]: {
    request: z.void(),
    response: TrashStatsSchema
  },
  [IPC_CHANNELS.TRASH_RESTORE]: {
    request: z.object({ ids: z.array(z.number()).min(1) }),
    response: RestoreResultSchema
  },
  [IPC_CHANNELS.TRASH_RESTORE_ALL]: {
    request: z.void(),
    response: RestoreResultSchema
  },
  [IPC_CHANNELS.TRASH_EMPTY]: {
    request: z.void(),
    response: z.object({ deletedCount: z.number(), bytesFreed: z.number() })
  },
  [IPC_CHANNELS.TRASH_DELETE_ENTRY]: {
    request: z.object({ ids: z.array(z.number()).min(1) }),
    response: z.object({
      /** Everything removed, including the members of any pile. */
      deletedIds: z.array(z.number()),
      /** Ids that were not in Trash. */
      skippedIds: z.array(z.number())
    })
  }
} as const
