import { z } from 'zod'
import { AiStatusUpdateSchema } from './ipc/ai-status'
import { VariationSchema, VariationSourceSchema } from './pile-variation'

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
  tags: z.array(
    z.object({
      tagId: z.number(),
      label: z.string()
    })
  )
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
 * Why an edit is on offer on a variant (design L7), so the line and the preview can say so:
 * - `unjudged`: the model doesn't check edits (the 4B, Apple), so every untouched variant is offered it (L7.9);
 * - `refused`: the model (the 9B) checked and said no, with its reason for the preview's header (L7.7);
 * - `slow`: the check ran out of time before it reached this one, or Look it over closed first (L7.E4);
 * - `failed`: the check, or the rewrite after its yes, failed (L7.E5);
 * - `undone`: the edit reached it and the person undid it (L7.E3).
 */
export const OfferWhySchema = z.enum(['unjudged', 'refused', 'slow', 'failed', 'undone'])
export type OfferWhy = z.infer<typeof OfferWhySchema>

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
  own: DraftWordsSchema.nullable(),
  /** Why it's on offer, once it is. Left out on drafts from before it was kept. */
  why: OfferWhySchema.optional()
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
  /** Why the edit is on offer (`offered`, `dismissed`); null while it's being checked or once it's in. */
  why: OfferWhySchema.nullable(),
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
  /**
   * The Title field. In a pile it is the pile's base, the same on every item in it; a mockup on its
   * own has only this (design/specs/pile-titles.md).
   */
  title: z.string(),
  /**
   * In a pile, this mockup's own part of its title (`base · variation`), with where it came from:
   * `ai`, its file name's `marker`, its `number` in the pile, or `typed` by the person. Null on a
   * mockup on its own.
   */
  variation: VariationSchema.nullable(),
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
  /**
   * Where its AI suggestion is, as `ai:status` says it (design L6): writing (`pending` with
   * `run.phase` `queued`, or `sniffing`), couldn't write (`failed`), filled in by the person
   * (`opted_out`), done (`ready`) or the AI off (`off`). Later changes come on `ai:status`.
   */
  ai: AiStatusUpdateSchema.omit({ mockupId: true }),
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
  /** The active model checks an edit to a pile top against each variant (the 9B), for L7.1's line. */
  checksEdits: z.boolean(),
  /** Where Finish later left off, if it did. */
  resume: z.object({ unitId: z.number(), mockupId: z.number() }).nullable()
})
export type LookOverQueue = z.infer<typeof LookOverQueueSchema>

export const SaveDraftRequestSchema = z.object({
  mockupId: z.number(),
  /** In a pile, the pile's base: a new one renames every mockup in the pile, exactly. */
  title: z.string().min(1),
  /**
   * In a pile, this mockup's variation as the person left it. Left out, it stays as it is; empty,
   * it takes its file marker or number back. Ignored on a mockup on its own.
   */
  variation: z.string().optional(),
  description: z.string(),
  tagIds: z.array(z.number()),
  /** Defaults to true: saving means the user looked at it. */
  checked: z.boolean().optional()
})
export type SaveDraftRequest = z.infer<typeof SaveDraftRequestSchema>

export const SaveDraftResponseSchema = z.object({
  /** Other mockups this save changed: their base, their words, or the edit check or offer they now carry. */
  propagatedIds: z.array(z.number())
})

/**
 * The person's answer to the top's edit on one variant (design/specs/look-over.md, L7): `accept`
 * an offer (Apply here, Apply anyway), `undo` an edit that reached it, `dismiss` an offer (×), or
 * `restore` a dismissed one (⌘Z).
 */
export const AnswerEditRequestSchema = z.object({
  mockupId: z.number(),
  action: z.enum(['accept', 'undo', 'dismiss', 'restore'])
})
export type AnswerEditRequest = z.infer<typeof AnswerEditRequestSchema>

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
      sortedAt: z.string().nullable(),
      /** Left out by snapshots from before base titles. */
      variation: z.string().nullable().optional(),
      variationSource: VariationSourceSchema.nullable().optional()
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
      carry: DraftCarrySchema.nullable(),
      /** Left out by snapshots from before base titles. */
      variation: z.string().nullable().optional(),
      variationSource: VariationSourceSchema.nullable().optional()
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
    /** The rows as they were. Undo goes through the stash's history entry. */
    snapshot: StashSnapshotSchema
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not-ready', 'no-cover']),
    mockupIds: z.array(z.number())
  })
])
export type StashResult = z.infer<typeof StashResultSchema>
