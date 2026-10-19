import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

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

/** Import: copying PSDs into the stash. */
export const importContract = {
  [IPC_CHANNELS.IMPORT_START]: {
    request: z.object({ paths: z.array(z.string()) }),
    response: ImportSummarySchema
  },
  [IPC_CHANNELS.IMPORT_CANCEL]: {
    request: z.object({ batchId: z.string() }),
    response: z.object({ cancelled: z.boolean() })
  },
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. `request` is the event payload;
  // `response: z.void()` is a placeholder and no invoke handler is registered.
  [IPC_CHANNELS.IMPORT_PROGRESS]: {
    request: ImportProgressSchema,
    response: z.void()
  }
} as const
