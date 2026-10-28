import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { LibraryItemSchema, LibraryQuerySchema, LibraryStatsSchema } from '../library'

/** Library (My Stash). */
export const libraryContract = {
  [IPC_CHANNELS.LIBRARY_LIST]: {
    request: LibraryQuerySchema,
    response: z.object({
      items: z.array(LibraryItemSchema),
      /** Meaning search ran out of time while its model was starting: ask once more for the same list (H-3). */
      meaningSkipped: z.literal(true).optional()
    })
  },
  [IPC_CHANNELS.LIBRARY_STATS]: {
    request: z.void(),
    response: LibraryStatsSchema
  }
} as const
