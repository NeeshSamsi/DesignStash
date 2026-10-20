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
  sizeBytes: z.number().nullable()
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
