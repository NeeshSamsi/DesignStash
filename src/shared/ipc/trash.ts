import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { LibraryItemSchema } from '../library'

/**
 * Mockups or piles to move. `mockupId` is the single-id form the old screens send;
 * WP2.7 moves them to `ids` and drops it.
 */
const TrashTargetsSchema = z.union([
  z.object({ ids: z.array(z.number()).min(1) }),
  z.object({ mockupId: z.number() })
])

/** Trash. */
export const trashContract = {
  [IPC_CHANNELS.LIBRARY_TRASH_LIST]: {
    request: z.void(),
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  [IPC_CHANNELS.MOCKUP_TRASH]: {
    request: TrashTargetsSchema,
    response: z.object({ ok: z.boolean(), count: z.number() })
  },
  [IPC_CHANNELS.MOCKUP_RESTORE]: {
    request: TrashTargetsSchema,
    response: z.object({ ok: z.boolean(), count: z.number() })
  },
  [IPC_CHANNELS.MOCKUP_DELETE_PERMANENT]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  }
} as const
