import { z } from 'zod'

// A tag attached to an item in the approval queue
export const ApprovalTagSchema = z.object({
  tagId: z.number(),
  label: z.string(),
  categoryId: z.number(),
  categoryLabel: z.string()
})
export type ApprovalTag = z.infer<typeof ApprovalTagSchema>

// Tags grouped by category (for the tag picker UI)
export const TagsByCategorySchema = z.object({
  categoryId: z.number(),
  categoryLabel: z.string(),
  tags: z.array(z.object({
    tagId: z.number(),
    label: z.string()
  }))
})
export type TagsByCategory = z.infer<typeof TagsByCategorySchema>

// ---- Look it over (drafts until Stash pile) ----

const LookOverCoverSchema = z.object({
  path: z.string(),
  source: z.enum(['embedded', 'sidecar', 'user-uploaded', 'default', 'none']),
  /** The cover file is gone from disk. */
  missing: z.boolean(),
  /** The image's own size, for the crop or bars note. null when it can't be read. */
  width: z.number().nullable(),
  height: z.number().nullable()
})

/** One step in Look it over: a mockup, shown as its draft. */
export const LookOverItemSchema = z.object({
  mockupId: z.number(),
  /** The pile it belongs to (its top mockup's id), or null for a mockup on its own. */
  pileId: z.number().nullable(),
  role: z.enum(['top', 'variant', 'single']),
  title: z.string(),
  description: z.string(),
  tags: z.array(ApprovalTagSchema),
  /** The user changed this variant, so edits to the top mockup no longer overwrite it. */
  touched: z.boolean(),
  /** The user has opened it. An unchecked one reads "Not checked" on the review step. */
  checked: z.boolean(),
  cover: LookOverCoverSchema,
  /** The image next to the PSD that became the cover, when there is one to offer. */
  sidecarFileName: z.string().nullable()
})
export type LookOverItem = z.infer<typeof LookOverItemSchema>

/** A pile (top first, then its variants) or a mockup on its own. */
export const LookOverUnitSchema = z.object({
  unitId: z.number(),
  kind: z.enum(['pile', 'single']),
  items: z.array(LookOverItemSchema).min(1)
})
export type LookOverUnit = z.infer<typeof LookOverUnitSchema>

/** Piles first, then mockups on their own. */
export const LookOverQueueSchema = z.object({
  units: z.array(LookOverUnitSchema),
  /** Where Finish later left off, if it did. */
  resume: z.object({ unitId: z.number(), mockupId: z.number() }).nullable()
})
export type LookOverQueue = z.infer<typeof LookOverQueueSchema>

export const SaveDraftRequestSchema = z.object({
  mockupId: z.number(),
  title: z.string().min(1),
  description: z.string(),
  tagIds: z.array(z.number()),
  /** Defaults to true: saving means the user looked at it. */
  checked: z.boolean().optional()
})
export type SaveDraftRequest = z.infer<typeof SaveDraftRequestSchema>

export const SaveDraftResponseSchema = z.object({
  /** Variants that took on the top mockup's new description and tags. */
  propagatedIds: z.array(z.number())
})

/** Reported by the Look it over service while an edit to a top mockup carries over to the variants that were not touched. */
export const LookOverProgressSchema = z.object({
  pileId: z.number(),
  completed: z.number(),
  total: z.number(),
  phase: z.enum(['running', 'done'])
})
export type LookOverProgress = z.infer<typeof LookOverProgressSchema>

// ---- Stash pile (commit the whole pile at once) ----

/** What a stash replaced, so Undo can put every mockup back exactly as it was. */
export const StashSnapshotSchema = z.object({
  mockups: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().nullable(),
      tagIds: z.array(z.number()),
      stage: z.enum(['to_sort', 'to_stash', 'stashed']),
      sortedAt: z.string().nullable()
    })
  ),
  drafts: z.array(
    z.object({
      mockupId: z.number(),
      title: z.string(),
      description: z.string(),
      tagIds: z.array(z.number()),
      touched: z.boolean(),
      checked: z.boolean(),
      skippedAt: z.string().nullable()
    })
  ),
  resume: z.object({ unitId: z.number(), mockupId: z.number() }).nullable()
})
export type StashSnapshot = z.infer<typeof StashSnapshotSchema>

/** Stashing is all or nothing. A refusal changes nothing and says why, with the mockups that are the reason. */
export const StashResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** Everything now in My Stash: the top and its variants, or the one mockup. */
    stashedIds: z.array(z.number()),
    /** Pass to PILE_UNSTASH to undo. */
    snapshot: StashSnapshotSchema
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not-ready', 'no-cover']),
    mockupIds: z.array(z.number())
  })
])
export type StashResult = z.infer<typeof StashResultSchema>
