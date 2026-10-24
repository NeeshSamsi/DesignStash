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

/** A description and tag ids, as a draft holds them. */
const DraftWordsSchema = z.object({ description: z.string(), tagIds: z.array(z.number()) })
export type DraftWords = z.infer<typeof DraftWordsSchema>

/**
 * Where the last edit to a pile top stands on one untouched variant, as its draft keeps it
 * (design/specs/look-over.md, L7):
 * - `checking`: the model (the 9B) is still judging it;
 * - `applied` or `reworded`: the edit is in the variant's words, as the top's or worked into its own;
 * - `offered`: the variant kept its own words and offers the edit, to accept by hand;
 * - `dismissed`: the person waved the offer away (⌘Z brings it back).
 */
export const DraftCarrySchema = z.object({
  state: z.enum(['checking', 'applied', 'reworded', 'offered', 'dismissed']),
  /** The top's words before and after the edit this is about. */
  top: z.object({ before: DraftWordsSchema, after: DraftWordsSchema }),
  /** Why the model left the edit out, in a few words ("this one is on a white backdrop"); null when nothing was judged. */
  reason: z.string().nullable(),
  /**
   * The description accepting gives, once made: the variant's own with the change worked in, or the
   * top's when the rewrite failed, was refused or timed out. Null while it is being prepared.
   */
  prepared: z.object({ description: z.string(), via: z.enum(['rewrite', 'copy']) }).nullable(),
  /** The variant's own words from before the edit reached it, for Undo. Null while it hasn't. */
  own: DraftWordsSchema.nullable()
})
export type DraftCarry = z.infer<typeof DraftCarrySchema>
export type CarryState = DraftCarry['state']

/**
 * The last edit to a pile's top, on an untouched variant, as Look it over shows it: whether the
 * model is still judging it, took it in, or left the variant's words and offers it.
 */
export const LookOverCarrySchema = z.object({
  state: DraftCarrySchema.shape.state,
  /** Why the model left the edit out, in a few words ("this one is on a white backdrop"); null when nothing was judged. */
  reason: z.string().nullable(),
  /**
   * The description accepting gives (an offer) or gave (applied, reworded). `copy` when it is the
   * top's because the rewrite failed, was refused or timed out. Null while it is being prepared.
   */
  after: z.object({ description: z.string(), via: z.enum(['rewrite', 'copy']) }).nullable(),
  /** The tags accepting adds and takes out, or added and took out: only the edit's own tag changes. */
  tagsAdded: z.array(ApprovalTagSchema),
  tagsRemoved: z.array(ApprovalTagSchema)
})
export type LookOverCarry = z.infer<typeof LookOverCarrySchema>

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
  /** Filled from its file name (and a variant's top) while the AI is still working on it. */
  waitingForAi: z.boolean(),
  /** A variant's state after an edit to its pile's top; null when none reached it. */
  carry: LookOverCarrySchema.nullable(),
  cover: LookOverCoverSchema
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
  /** Variants this save changed: their words, or the edit check or offer they now carry. */
  propagatedIds: z.array(z.number())
})

/** Reported by the Look it over service while the model judges an edit to a top mockup on the variants that were not touched. */
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
      skippedAt: z.string().nullable(),
      carry: DraftCarrySchema.nullable()
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
