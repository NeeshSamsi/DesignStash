import { z } from 'zod'

// A tag attached to an item in the approval queue
export const ApprovalTagSchema = z.object({
  tagId: z.number(),
  label: z.string(),
  categoryId: z.number(),
  categoryLabel: z.string()
})
export type ApprovalTag = z.infer<typeof ApprovalTagSchema>

// A single item in the approval queue (one mockup/variant to step through)
export const ApprovalItemSchema = z.object({
  mockupId: z.number(),
  leaderId: z.number().nullable(),   // null = singleton OR this item IS the leader; non-null = group member
  isLeader: z.boolean(),             // true if this item IS the group leader (has dependent members)
  variantIndex: z.number(),          // 0 for leaders/singletons; 1, 2, … for members in order
  title: z.string(),
  description: z.string(),
  tags: z.array(ApprovalTagSchema),
  coverPath: z.string(),
  coverSource: z.enum(['embedded', 'sidecar', 'user-uploaded', 'none']),
  sidecarFileName: z.string().nullable()  // set when coverSource === 'sidecar'; shown in approve/deny prompt
})
export type ApprovalItem = z.infer<typeof ApprovalItemSchema>

// Full queue returned by APPROVAL_INIT
export const ApprovalQueueSchema = z.object({
  batchId: z.string(),
  items: z.array(ApprovalItemSchema)  // ordered: group [leader, member1, member2, …], then singletons
})
export type ApprovalQueue = z.infer<typeof ApprovalQueueSchema>

// What the renderer sends to save one approved item
export const ApproveItemRequestSchema = z.object({
  mockupId: z.number(),
  title: z.string().min(1),
  description: z.string(),
  tagIds: z.array(z.number()),
  coverPath: z.string(),
  coverSource: z.enum(['embedded', 'sidecar', 'user-uploaded']),  // 'none' is not valid at save time
  isLeader: z.boolean(),
  wasEdited: z.boolean(),   // true if user changed any field from the AI suggestion
  leaderId: z.number().nullable()
})
export type ApproveItemRequest = z.infer<typeof ApproveItemRequestSchema>

// Response from APPROVAL_SAVE_ITEM
export const ApproveItemResponseSchema = z.object({
  saved: z.boolean(),
  reinferredItems: z.array(ApprovalItemSchema).optional()  // present when leader was edited and re-inference ran
})
export type ApproveItemResponse = z.infer<typeof ApproveItemResponseSchema>

// Cover upload request
export const ApprovalSetCoverRequestSchema = z.object({
  mockupId: z.number(),
  filePath: z.string()   // absolute path from window.api.getPathForFile()
})
export type ApprovalSetCoverRequest = z.infer<typeof ApprovalSetCoverRequestSchema>

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
