import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { TagsByCategorySchema } from '../approval'
import { TagTreeSchema, TagSnapshotSchema, CategorySnapshotSchema } from '../tags'

/** Tags and tag categories (two tiers, no nesting). */
export const tagsContract = {
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
  [IPC_CHANNELS.TAG_MERGE_PREVIEW]: {
    request: z.object({ sourceTagId: z.number(), targetTagId: z.number() }),
    response: z.object({ affectedMockups: z.number() })
  },
  [IPC_CHANNELS.TAG_DELETE]: {
    request: z.object({ tagId: z.number() }),
    response: z.object({ affectedMockups: z.number(), snapshot: TagSnapshotSchema })
  },
  [IPC_CHANNELS.TAG_RESTORE]: {
    request: z.object({ snapshot: TagSnapshotSchema }),
    response: z.object({ tagId: z.number(), restoredMockups: z.number() })
  },
  [IPC_CHANNELS.TAG_SET_CATEGORY]: {
    request: z.object({ tagId: z.number(), categoryId: z.number() }),
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
    // moveTagsTo: where a category's tags go (mockups keep them). Required unless it's empty.
    request: z.object({ categoryId: z.number(), moveTagsTo: z.number().optional() }),
    response: z.object({
      deleted: z.boolean(),
      movedTags: z.number(),
      snapshot: CategorySnapshotSchema
    })
  },
  [IPC_CHANNELS.CATEGORY_RESTORE]: {
    request: z.object({ snapshot: CategorySnapshotSchema }),
    response: z.object({ categoryId: z.number() })
  }
} as const
