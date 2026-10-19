import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

export const AiModelTierSchema = z.enum(['small', 'medium', 'large'])
export type AiModelTier = z.infer<typeof AiModelTierSchema>

export const AiModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: AiModelTierSchema,
  sizeBytes: z.number(),
  installed: z.boolean(),
  active: z.boolean()
})
export type AiModelInfo = z.infer<typeof AiModelInfoSchema>

export const AiDownloadProgressSchema = z.object({
  modelId: z.string(),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  phase: z.enum(['downloading', 'verifying', 'done', 'error']),
  error: z.string().optional()
})
export type AiDownloadProgress = z.infer<typeof AiDownloadProgressSchema>

/** On-device AI models. */
export const aiContract = {
  [IPC_CHANNELS.AI_HARDWARE_INFO]: {
    request: z.void(),
    response: z.object({
      chip: z.string(),
      totalMemoryGB: z.number(),
      isAppleSilicon: z.boolean(),
      recommendedTier: AiModelTierSchema
    })
  },
  [IPC_CHANNELS.AI_LIST_MODELS]: {
    request: z.void(),
    response: z.object({ models: z.array(AiModelInfoSchema) })
  },
  [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: {
    request: z.object({ id: z.string() }),
    response: z.object({ started: z.boolean() })
  },
  [IPC_CHANNELS.AI_CANCEL_DOWNLOAD]: {
    request: z.object({ id: z.string() }),
    response: z.object({ cancelled: z.boolean() })
  },
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. `request` is the event payload;
  // `response: z.void()` is a placeholder and no invoke handler is registered.
  [IPC_CHANNELS.AI_DOWNLOAD_PROGRESS]: {
    request: AiDownloadProgressSchema,
    response: z.void()
  },
  [IPC_CHANNELS.AI_GET_ACTIVE]: {
    request: z.void(),
    response: z.object({ modelId: z.string().nullable() })
  },
  [IPC_CHANNELS.AI_SET_ACTIVE]: {
    request: z.object({ id: z.string().nullable() }),
    response: z.object({ modelId: z.string().nullable() })
  }
} as const
