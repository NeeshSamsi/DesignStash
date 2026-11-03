import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { LibraryItemSchema, LibraryQuerySchema, LibraryStatsSchema } from '../library'

/** Library (My Stash). */
export const libraryContract = {
  [IPC_CHANNELS.LIBRARY_LIST]: {
    request: LibraryQuerySchema,
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  [IPC_CHANNELS.LIBRARY_STATS]: {
    request: z.void(),
    response: LibraryStatsSchema
  }
} as const
