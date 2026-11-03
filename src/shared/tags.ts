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
    tagCount: z.number(),
    tags: z.array(TagTreeNodeSchema)
  })
)
export type TagTree = z.infer<typeof TagTreeSchema>

/** An existing tag with the same name, wherever it lives ("Already a tag elsewhere"). */
export const TagMatchSchema = z.object({
  tagId: z.number(),
  label: z.string(),
  categoryId: z.number(),
  categoryLabel: z.string(),
  usageCount: z.number()
})
export type TagMatch = z.infer<typeof TagMatchSchema>

/**
 * A tag label as it is compared: lowercase, with spaces, hyphens and underscores all counting as
 * one space. "iPhone" and "iphone" match, and so do "Android phone" and "android-phone".
 */
export function normaliseTagLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()
}
