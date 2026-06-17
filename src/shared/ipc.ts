import { z } from 'zod'

/** IPC channel names. */
export const IPC_CHANNELS = {
  APP_INFO: 'app:info',
  DB_PING: 'db:ping',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_LIBRARY_ROOT: 'settings:set-library-root',
  DIALOG_SELECT_DIRECTORY: 'dialog:select-directory'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/** Maps each channel to its request/response zod schemas (validated on both ends). */
export const IPC_CONTRACT = {
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
  },
  [IPC_CHANNELS.SETTINGS_GET]: {
    request: z.void(),
    response: z.object({
      libraryRoot: z.string(),
      onboarded: z.boolean()
    })
  },
  [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: {
    request: z.object({ path: z.string().min(1) }),
    response: z.object({ libraryRoot: z.string() })
  },
  [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: {
    request: z.void(),
    response: z.object({ path: z.string().nullable() })
  }
} as const

export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['response']>

/** Standard wrapper so the renderer always gets a typed success/error result. */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
