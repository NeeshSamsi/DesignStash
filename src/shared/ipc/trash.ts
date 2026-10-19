import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { LibraryItemSchema } from '../library'

/** Trash. */
export const trashContract = {
  [IPC_CHANNELS.LIBRARY_TRASH_LIST]: {
    request: z.void(),
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  [IPC_CHANNELS.MOCKUP_TRASH]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_RESTORE]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_DELETE_PERMANENT]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  }
} as const
