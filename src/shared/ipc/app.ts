import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/** App info and health. */
export const appContract = {
  [IPC_CHANNELS.APP_INFO]: {
    request: z.void(),
    response: z.object({
      name: z.string(),
      version: z.string(),
      env: z.enum(['development', 'production', 'test'])
    })
  },
  [IPC_CHANNELS.DB_PING]: {
    request: z.void(),
    response: z.object({
      success: z.boolean(),
      message: z.string(),
      timestamp: z.number()
    })
  }
} as const
