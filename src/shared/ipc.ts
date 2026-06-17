import { z } from 'zod'
import { IPC_CHANNELS, type IpcChannel } from './ipc-channels'
export { IPC_CHANNELS, type IpcChannel }
import { GroupingProposalSchema, GroupingConfirmRequestSchema } from './grouping'
import {
  ApprovalQueueSchema,
  ApproveItemRequestSchema,
  ApproveItemResponseSchema,
  ApprovalSetCoverRequestSchema,
  TagsByCategorySchema
} from './approval'
import {
  LibraryItemSchema,
  LibraryQuerySchema,
  LibraryStatsSchema,
  MockupDetailSchema
} from './library'
import { TagTreeSchema } from './tags'
import { IntegrityReportSchema } from './integrity'

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
  },
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
  },
  [IPC_CHANNELS.GROUPING_PROPOSE]: {
    request: z.object({ batchId: z.string() }),
    response: GroupingProposalSchema
  },
  [IPC_CHANNELS.GROUPING_CONFIRM]: {
    request: GroupingConfirmRequestSchema,
    response: z.object({ confirmed: z.boolean() })
  },
  [IPC_CHANNELS.APPROVAL_INIT]: {
    request: z.object({ batchId: z.string() }),
    response: ApprovalQueueSchema
  },
  [IPC_CHANNELS.APPROVAL_SAVE_ITEM]: {
    request: ApproveItemRequestSchema,
    response: ApproveItemResponseSchema
  },
  [IPC_CHANNELS.APPROVAL_SET_COVER]: {
    request: ApprovalSetCoverRequestSchema,
    response: z.object({ coverPath: z.string(), coverSource: z.literal('user-uploaded') })
  },
  [IPC_CHANNELS.TAG_LIST_BY_CATEGORY]: {
    request: z.void(),
    response: z.object({ categories: z.array(TagsByCategorySchema) })
  },
  [IPC_CHANNELS.TAG_CREATE]: {
    request: z.object({ label: z.string().min(1), categoryId: z.number() }),
    response: z.object({ tagId: z.number(), label: z.string(), categoryId: z.number() })
  },
  [IPC_CHANNELS.TAG_TREE]: {
    request: z.void(),
    response: z.object({ tree: TagTreeSchema })
  },
  [IPC_CHANNELS.TAG_RENAME]: {
    request: z.object({ tagId: z.number(), label: z.string().min(1) }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.TAG_MERGE]: {
    request: z.object({ sourceTagId: z.number(), targetTagId: z.number() }),
    response: z.object({ affectedMockups: z.number() })
  },
  [IPC_CHANNELS.TAG_DELETE]: {
    request: z.object({ tagId: z.number() }),
    response: z.object({ affectedMockups: z.number() })
  },
  [IPC_CHANNELS.TAG_SET_CATEGORY]: {
    request: z.object({ tagId: z.number(), categoryId: z.number() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.TAG_SET_PARENT]: {
    request: z.object({ tagId: z.number(), parentTagId: z.number().nullable() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.CATEGORY_CREATE]: {
    request: z.object({ label: z.string().min(1) }),
    response: z.object({ categoryId: z.number(), label: z.string() })
  },
  [IPC_CHANNELS.CATEGORY_RENAME]: {
    request: z.object({ categoryId: z.number(), label: z.string().min(1) }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.CATEGORY_DELETE]: {
    request: z.object({ categoryId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  },
  [IPC_CHANNELS.LIBRARY_LIST]: {
    request: LibraryQuerySchema,
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  [IPC_CHANNELS.LIBRARY_STATS]: {
    request: z.void(),
    response: LibraryStatsSchema
  },
  [IPC_CHANNELS.LIBRARY_TRASH_LIST]: {
    request: z.void(),
    response: z.object({ items: z.array(LibraryItemSchema) })
  },
  [IPC_CHANNELS.MOCKUP_DETAIL]: {
    request: z.object({ mockupId: z.number() }),
    response: MockupDetailSchema
  },
  [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: {
    request: z.object({ mockupId: z.number(), favourite: z.boolean() }),
    response: z.object({ favourite: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_UPDATE]: {
    request: z.object({ mockupId: z.number(), title: z.string().min(1), description: z.string(), tagIds: z.array(z.number()) }),
    response: z.object({ updated: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ opened: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_TRASH]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_RESTORE]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ ok: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_DELETE_PERMANENT]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_DUPLICATE]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ newMockupId: z.number() })
  },
  [IPC_CHANNELS.GROUP_UNGROUP]: {
    request: z.object({ leaderId: z.number() }),
    response: z.object({ ungrouped: z.boolean() })
  },
  [IPC_CHANNELS.GROUP_DELETE]: {
    request: z.object({ leaderId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  },
  [IPC_CHANNELS.INTEGRITY_SCAN]: {
    request: z.void(),
    response: IntegrityReportSchema
  },
  [IPC_CHANNELS.INTEGRITY_ADD_ORPHAN]: {
    request: z.object({ filePath: z.string() }),
    response: z.object({ mockupId: z.number() })
  },
  [IPC_CHANNELS.INTEGRITY_DELETE_RECORD]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  }
} as const

export type IpcRequest<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<(typeof IPC_CONTRACT)[C]['response']>

/** Standard wrapper so the renderer always gets a typed success/error result. */
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
