import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/** DEV-only debug tools. */
export const debugContract = {
  [IPC_CHANNELS.DEBUG_RESET_APP]: {
    request: z.void(),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.DEBUG_READ_SETTINGS]: {
    request: z.void(),
    response: z.object({ path: z.string(), json: z.string(), exists: z.boolean() })
  }
} as const
