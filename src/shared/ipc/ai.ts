import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

export const AiModelTierSchema = z.enum(['small', 'medium', 'large'])
export type AiModelTier = z.infer<typeof AiModelTierSchema>

export const AiModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: AiModelTierSchema,
  /** Both files together. */
  sizeBytes: z.number(),
  description: z.string(),
  languages: z.array(z.string()),
  /** 1 to 5. */
  quality: z.number().min(1).max(5),
  speed: z.number().min(1).max(5),
  minMemoryGB: z.number(),
  /** The model shown as "Best fit for this Mac". */
  bestFit: z.boolean(),
  /**
   * Comes with macOS (Apple's on-device model): nothing to download or delete, always installed.
   * Listed only when this Mac can run it (macOS 27, Apple Intelligence on).
   */
  builtIn: z.boolean(),
  /** Bytes of a stopped download already on disk. Trying again carries on from here. */
  downloadedBytes: z.number(),
  installed: z.boolean(),
  active: z.boolean()
})
export type AiModelInfo = z.infer<typeof AiModelInfoSchema>

/** The only reasons a download stops. */
export const AiDownloadFailureSchema = z.enum(['offline', 'disk-full', 'checksum', 'server'])
export type AiDownloadFailure = z.infer<typeof AiDownloadFailureSchema>

export const AiDownloadProgressSchema = z.object({
  modelId: z.string(),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  phase: z.enum(['downloading', 'verifying', 'done', 'error']),
  /** Recent speed in bytes per second. 0 until it can be measured. */
  bytesPerSecond: z.number().optional(),
  /** Seconds left at the current speed. null until the speed is known. */
  secondsLeft: z.number().nullable().optional(),
  /** Set with phase `error`: why the download stopped. Trying again resumes. */
  reason: AiDownloadFailureSchema.optional()
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
    response: z.object({
      models: z.array(AiModelInfoSchema),
      /** Folders from earlier versions (the old text models). Ignored by the app and deletable. */
      legacy: z.array(z.object({ id: z.string(), sizeBytes: z.number() }))
    })
  },
  [IPC_CHANNELS.AI_DOWNLOAD_MODEL]: {
    request: z.object({ id: z.string() }),
    response: z.object({ started: z.boolean() })
  },
  [IPC_CHANNELS.AI_CANCEL_DOWNLOAD]: {
    request: z.object({ id: z.string() }),
    response: z.object({ cancelled: z.boolean() })
  },
  [IPC_CHANNELS.AI_DELETE_MODEL]: {
    request: z.object({
      id: z.string().min(1),
      /** Needed to delete the model in use; without it the model is kept and `inUse` comes back true. */
      confirmed: z.boolean().optional()
    }),
    response: z.object({
      deleted: z.boolean(),
      /** The model is the one in use. When not confirmed, nothing was deleted: ask first. */
      inUse: z.boolean(),
      /** AI_RESTORE_MODEL can bring it back until the next launch. False for old text models. */
      undoable: z.boolean()
    })
  },
  [IPC_CHANNELS.AI_RESTORE_MODEL]: {
    request: z.object({ id: z.string().min(1), makeActive: z.boolean().optional() }),
    response: z.object({ restored: z.boolean() })
  },
  [IPC_CHANNELS.AI_SET_ACTIVE]: {
    request: z.object({ id: z.string().nullable() }),
    response: z.object({ modelId: z.string().nullable() })
  }
} as const
