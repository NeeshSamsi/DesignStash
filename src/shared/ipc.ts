import { z } from 'zod'
import { IPC_CHANNELS, type IpcChannel } from './ipc-channels'
export { IPC_CHANNELS, type IpcChannel }

export const ImportProgressSchema = z.object({
  batchId: z.string(),
  phase: z.enum(['scanning', 'copying', 'done']),
  completed: z.number(),
  total: z.number(),
  currentTitle: z.string().optional()
})
export type ImportProgress = z.infer<typeof ImportProgressSchema>

export const ImportSummarySchema = z.object({
  batchId: z.string(),
  items: z.array(
    z.object({
      title: z.string(),
      status: z.enum(['imported', 'pending_preview', 'duplicate', 'error']),
      mockupId: z.number().optional(),
      coverSource: z.enum(['embedded', 'sidecar']).optional(),
      detail: z.string().optional()
    })
  ),
  imported: z.number(),
  pendingPreview: z.number(),
  duplicates: z.number(),
  errors: z.number(),
  skippedNonPsd: z.number()
})
export type ImportSummary = z.infer<typeof ImportSummarySchema>

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
  },
  [IPC_CHANNELS.DIALOG_SELECT_PSD_FILES]: {
    request: z.void(),
    response: z.object({ paths: z.array(z.string()) })
  },
  [IPC_CHANNELS.IMPORT_START]: {
    request: z.object({ paths: z.array(z.string()) }),
    response: ImportSummarySchema
  },
  [IPC_CHANNELS.IMPORT_CANCEL]: {
    request: z.object({ batchId: z.string() }),
    response: z.object({ cancelled: z.boolean() })
  },
  [IPC_CHANNELS.IMPORT_PROGRESS]: {
    request: ImportProgressSchema,
    response: z.void()
  }
} as const

export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['response']>

/** Standard wrapper so the renderer always gets a typed success/error result. */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
