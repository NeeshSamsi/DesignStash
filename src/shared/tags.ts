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

/** Everything needed to undo a tag delete: the tag row and the mockups that carried it. */
export const TagSnapshotSchema = z.object({
  tag: z.object({
    id: z.number(),
    label: z.string(),
    categoryId: z.number(),
    isCanonical: z.boolean(),
    createdBy: z.enum(['seed', 'ai', 'user'])
  }),
  mockupIds: z.array(z.number())
})
export type TagSnapshot = z.infer<typeof TagSnapshotSchema>

/** A deleted category's row, for Undo. Only an empty category is restored this way. */
export const CategorySnapshotSchema = z.object({
  id: z.number(),
  label: z.string(),
  sortOrder: z.number(),
  isCanonical: z.boolean()
})
export type CategorySnapshot = z.infer<typeof CategorySnapshotSchema>

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
