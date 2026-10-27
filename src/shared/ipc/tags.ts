import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { TagsByCategorySchema } from '../approval'
import { TagTreeSchema, TagSnapshotSchema, CategorySnapshotSchema } from '../tags'

/**
 * A rename or move: done, or refused because another tag in that category, or another category,
 * already reads the same. A refusal names what's there, so Settings can say it.
 */
export const NameChangeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    reason: z.literal('taken'),
    /** The name already there, as it's written. */
    label: z.string(),
    /** The category it's in, when it's a tag. */
    categoryLabel: z.string().optional()
  })
])
export type NameChange = z.infer<typeof NameChangeSchema>

/** Tags and tag categories (two tiers, no nesting). */
export const tagsContract = {
  [IPC_CHANNELS.TAG_LIST_BY_CATEGORY]: {
    request: z.void(),
    response: z.object({ categories: z.array(TagsByCategorySchema) })
  },
  [IPC_CHANNELS.TAG_CREATE]: {
    request: z.object({ label: z.string().trim().min(1), categoryId: z.number() }),
    response: z.object({ tagId: z.number(), label: z.string(), categoryId: z.number() })
  },
  [IPC_CHANNELS.TAG_TREE]: {
    request: z.void(),
    response: z.object({ tree: TagTreeSchema })
  },
  [IPC_CHANNELS.TAG_RENAME]: {
    request: z.object({ tagId: z.number(), label: z.string().trim().min(1) }),
    response: NameChangeSchema
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
    response: NameChangeSchema
  },
  [IPC_CHANNELS.CATEGORY_CREATE]: {
    request: z.object({ label: z.string().trim().min(1) }),
    response: z.object({ categoryId: z.number(), label: z.string() })
  },
  [IPC_CHANNELS.CATEGORY_RENAME]: {
    request: z.object({ categoryId: z.number(), label: z.string().trim().min(1) }),
    response: NameChangeSchema
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
