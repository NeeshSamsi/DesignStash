import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { InboxCountsSchema, InboxItemSchema, InboxStageSchema } from '../inbox'
import { withUndoEntry } from './undo'

/** To sort and To stash. */
export const inboxContract = {
  [IPC_CHANNELS.INBOX_LIST]: {
    request: z.object({ stage: InboxStageSchema }),
    response: z.object({ items: z.array(InboxItemSchema) })
  },
  [IPC_CHANNELS.INBOX_COUNTS]: {
    request: z.void(),
    response: InboxCountsSchema
  },
  [IPC_CHANNELS.INBOX_TOSS]: {
    request: z.object({ ids: z.array(z.number()).min(1) }),
    response: withUndoEntry(
      z.object({
        /** Everything removed: the ids asked for, plus the members of any pile among them. */
        tossedIds: z.array(z.number()),
        /** Ids that were not in an inbox (already stashed, in Trash or gone). */
        skippedIds: z.array(z.number())
      })
    )
  }
} as const
