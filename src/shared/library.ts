import { z } from 'zod'

export const LibraryTagSchema = z.object({
  id: z.number(),
  label: z.string(),
  categoryLabel: z.string()
})
export type LibraryTag = z.infer<typeof LibraryTagSchema>

export const LibraryItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  coverPath: z.string(),
  isGroup: z.boolean(),
  favourite: z.boolean(),
  reviewStatus: z.enum(['needs_review', 'approved']),
  variantCount: z.number(),
  tags: z.array(LibraryTagSchema)
})
export type LibraryItem = z.infer<typeof LibraryItemSchema>

export const LibraryQuerySchema = z.object({
  /** Every picked tag must match (AND). */
  tagIds: z.array(z.number()).optional(),
  /** Category-level roll-up: a mockup matches a category if it has any tag in it; categories AND together. */
  categoryIds: z.array(z.number()).optional(),
  query: z.string().optional(),
  sort: z.enum(['date', 'name']).default('date')
})
export type LibraryQuery = z.infer<typeof LibraryQuerySchema>

export const LibraryStatsSchema = z.object({
  total: z.number(),
  favourites: z.number(),
  groups: z.number(),
  trashed: z.number()
})
export type LibraryStats = z.infer<typeof LibraryStatsSchema>

export const VariantSchema = z.object({
  id: z.number(),
  title: z.string(),
  coverPath: z.string()
})
export type Variant = z.infer<typeof VariantSchema>

export const MockupDetailSchema = z.object({
  item: LibraryItemSchema,
  variants: z.array(VariantSchema)
})
export type MockupDetail = z.infer<typeof MockupDetailSchema>
