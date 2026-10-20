import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

const UpdateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('up-to-date'), lastCheckedAt: z.string().nullable() }),
  z.object({
    state: z.literal('available'),
    version: z.string(),
    lastCheckedAt: z.string().nullable()
  }),
  z.object({
    state: z.literal('downloading'),
    version: z.string(),
    progress: z.number(),
    lastCheckedAt: z.string().nullable()
  }),
  z.object({ state: z.literal('ready'), version: z.string(), lastCheckedAt: z.string().nullable() })
])

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
  [IPC_CHANNELS.APP_RELAUNCH]: {
    request: z.void(),
    response: z.object({ relaunching: z.boolean() })
  },
  /** The crash screen's Reload: reloads the window. */
  [IPC_CHANNELS.APP_RELOAD]: { request: z.void(), response: z.object({ reloading: z.boolean() }) },
  [IPC_CHANNELS.APP_QUIT]: { request: z.void(), response: z.object({ quitting: z.boolean() }) },
  [IPC_CHANNELS.UPDATES_STATUS]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_CHECK]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_CANCEL]: { request: z.void(), response: UpdateStatusSchema },
  [IPC_CHANNELS.UPDATES_INSTALL]: {
    request: z.void(),
    response: z.object({ installing: z.boolean() })
  },
  [IPC_CHANNELS.LICENCES_TEXT]: { request: z.void(), response: z.object({ text: z.string() }) },
  [IPC_CHANNELS.REPORT_COPY]: { request: z.void(), response: z.object({ copied: z.boolean() }) },
  [IPC_CHANNELS.DB_PING]: {
    request: z.void(),
    response: z.object({
      success: z.boolean(),
      message: z.string(),
      timestamp: z.number()
    })
  }
} as const
