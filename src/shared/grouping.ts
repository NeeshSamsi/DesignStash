import { z } from 'zod'

// A single member within a proposed group
export const GroupMemberSchema = z.object({
  mockupId: z.number(),
  isPrimary: z.boolean(), // true for the alphabetically-first member (will become group leader on confirm)
  coverPath: z.string(), // absolute path to cover.png (for thumbnail display)
  fileName: z.string(), // original filename (for display + stem matching)
  folderTrail: z.array(z.string()), // captured from importContext.folderTrail
  /** The zip it came out of, by its file name as dropped. PSDs from one zip are suggested as one pile. */
  archive: z.string().optional(),
  /** That zip's cleaned name ("Apple Watch Ultra Mockup"), when it says something. Titles the pile. */
  archiveTitle: z.string().optional()
})
export type GroupMember = z.infer<typeof GroupMemberSchema>

// A proposed group (before user confirmation). No confidence: we only suggest piles we're confident about.
export const ProposedGroupSchema = z.object({
  id: z.string(), // temporary UUID — NOT a DB id
  members: z.array(GroupMemberSchema),
  reason: z.enum(['archive', 'folder', 'stem']) // archive = same dropped zip; folder = all same folder trail; stem = same filename stem
})
export type ProposedGroup = z.infer<typeof ProposedGroupSchema>

// The full proposal returned by GroupingService
export const GroupingProposalSchema = z.object({
  batchId: z.string(),
  groups: z.array(ProposedGroupSchema),
  singletons: z.array(GroupMemberSchema), // mockups not in any group
  /** True when suggesting piles failed: every mockup stands alone and the board works as normal. */
  suggestionFailed: z.boolean().optional()
})
export type GroupingProposal = z.infer<typeof GroupingProposalSchema>

// What the renderer sends back to confirm (may differ from original proposal after user edits)
export const ConfirmedGroupSchema = z.object({
  id: z.string(), // same temp UUID from proposal (for change-tracking)
  memberIds: z.array(z.number()) // ordered: index 0 becomes the group leader (isGroup=true)
})
export type ConfirmedGroup = z.infer<typeof ConfirmedGroupSchema>

export const GroupingConfirmRequestSchema = z.object({
  batchId: z.string(),
  groups: z.array(ConfirmedGroupSchema),
  singletonIds: z.array(z.number()) // mockupIds confirmed as standalone
})
export type GroupingConfirmRequest = z.infer<typeof GroupingConfirmRequestSchema>

/** Shown when the board can't be built. Plain words: no paths, no error codes. */
export const COULDNT_SUGGEST_PILES = 'Couldn’t suggest piles. You can still sort them by hand.'

/**
 * The Sort board as the user left it (Finish later from Sort). Same shape as a confirmed board:
 * each pile lists its mockups with the top first, and the rest stand alone.
 */
export const SortBoardSchema = z.object({
  batchId: z.string(),
  groups: z.array(z.object({ id: z.string(), memberIds: z.array(z.number()).min(2) })),
  singletonIds: z.array(z.number())
})
export type SortBoard = z.infer<typeof SortBoardSchema>
