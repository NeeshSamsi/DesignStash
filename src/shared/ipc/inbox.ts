import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { InboxCountsSchema, InboxItemSchema, InboxStageSchema } from '../inbox'

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
    response: z.object({
      /** Everything removed: the ids asked for, plus the members of any pile among them. */
      tossedIds: z.array(z.number()),
      /** Ids that were not in an inbox (already stashed, in Trash or gone). */
      skippedIds: z.array(z.number())
    })
  },
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. `request` is the event payload;
  // `response: z.void()` is a placeholder and no invoke handler is registered.
  [IPC_CHANNELS.INBOX_COUNTS_CHANGED]: {
    request: InboxCountsSchema,
    response: z.void()
  }
} as const
