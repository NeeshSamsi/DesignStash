import { z } from 'zod'
import { LibraryItemSchema } from './library'

/** The two inboxes. Mockups in My Stash have left the flow (stage `stashed`). */
export const InboxStageSchema = z.enum(['to_sort', 'to_stash'])
export type InboxStage = z.infer<typeof InboxStageSchema>

/** How far the AI suggestion has got for a mockup. `off` when the AI is not in use. */
export const AiStatusSchema = z.enum(['pending', 'sniffing', 'ready', 'failed', 'off'])
export type AiStatus = z.infer<typeof AiStatusSchema>

/** A card in To sort or To stash. To sort holds mockups on their own; To stash holds piles and singles. */
export const InboxItemSchema = LibraryItemSchema.extend({
  stage: InboxStageSchema,
  aiStatus: AiStatusSchema,
  /** The PSD's size in the stash folder. Null when it can't be measured. */
  sizeBytes: z.number().nullable(),
  /** The import batch the mockup arrived in. The grouping review and approval stepper work per batch. */
  batchId: z.string().nullable()
})
export type InboxItem = z.infer<typeof InboxItemSchema>

/** What the sidebar and the inbox pages count. */
export const InboxCountsSchema = z.object({
  /** Mockups waiting in To sort. */
  toSort: z.number(),
  /** Piles and singles waiting in To stash. */
  toStash: z.number(),
  /** Mockups in To sort whose AI suggestion is still coming ("Still sniffing 7 of 38"). */
  sniffing: z.number(),
  /** Piles and singles in Trash. */
  trash: z.number()
})
export type InboxCounts = z.infer<typeof InboxCountsSchema>

/** A card in Trash: a pile or a single mockup, with when it was trashed and the space it takes. */
export const TrashItemSchema = LibraryItemSchema.extend({
  trashedAt: z.string(),
  /** The PSDs in the pile or single, in bytes. 0 when they can't be measured. */
  sizeBytes: z.number()
})
export type TrashItem = z.infer<typeof TrashItemSchema>

export const TrashStatsSchema = z.object({
  /** Piles and singles in Trash. */
  count: z.number(),
  /** The space emptying Trash frees. */
  bytes: z.number()
})
export type TrashStats = z.infer<typeof TrashStatsSchema>
