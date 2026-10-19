import { z } from 'zod'

/** One tag node within a category in the tag-management tree (M8). */
export const TagTreeNodeSchema = z.object({
  tagId: z.number(),
  label: z.string(),
  usageCount: z.number()
})
export type TagTreeNode = z.infer<typeof TagTreeNodeSchema>

/** Categories (ordered by sortOrder) each with their tags + per-tag usage counts. */
export const TagTreeSchema = z.array(
  z.object({
    categoryId: z.number(),
    categoryLabel: z.string(),
    tags: z.array(TagTreeNodeSchema)
  })
)
export type TagTree = z.infer<typeof TagTreeSchema>
