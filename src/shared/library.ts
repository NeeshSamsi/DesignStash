import { z } from 'zod'

export const LibraryTagSchema = z.object({
  id: z.number(),
  label: z.string(),
  categoryLabel: z.string()
})
export type LibraryTag = z.infer<typeof LibraryTagSchema>

export const CoverSourceSchema = z.enum(['embedded', 'sidecar', 'user-uploaded', 'default', 'none'])
export type CoverSource = z.infer<typeof CoverSourceSchema>

export const LibraryItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  coverPath: z.string(),
  coverSource: CoverSourceSchema,
  /** The cover file is gone from disk. */
  coverMissing: z.boolean(),
  isGroup: z.boolean(),
  favourite: z.boolean(),
  reviewStatus: z.enum(['needs_review', 'approved']),
  createdAt: z.string(),
  /** Other mockups in the pile besides the top; 0 for a mockup on its own. */
  variantCount: z.number(),
  /** The pile's top mockup; null for a mockup on its own. */
  topId: z.number().nullable(),
  tags: z.array(LibraryTagSchema)
})
export type LibraryItem = z.infer<typeof LibraryItemSchema>

export const LibraryQuerySchema = z.object({
  /** Every picked tag must match (AND). */
  tagIds: z.array(z.number()).optional(),
  /** Category-level roll-up: a mockup matches a category if it has any tag in it; categories AND together. */
  categoryIds: z.array(z.number()).optional(),
  query: z.string().optional(),
  /** Only starred mockups (the Starred view). */
  starredOnly: z.boolean().optional(),
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
  coverPath: z.string(),
  coverMissing: z.boolean(),
  coverSource: CoverSourceSchema,
  isTop: z.boolean()
})
export type Variant = z.infer<typeof VariantSchema>

export const MockupDetailSchema = z.object({
  item: LibraryItemSchema,
  variants: z.array(VariantSchema)
})
export type MockupDetail = z.infer<typeof MockupDetailSchema>

/**
 * How a card shows its cover, from the item alone. A missing file wins over "no preview", and
 * both win over selection; the same rule on My Stash, the pile page, Trash and the inboxes.
 */
export function coverDisplay(
  item: { coverMissing: boolean; coverSource: z.infer<typeof CoverSourceSchema> },
  selected = false
): 'cover-missing' | 'no-preview' | 'selected' | 'default' {
  if (item.coverMissing) return 'cover-missing'
  if (item.coverSource === 'none') return 'no-preview'
  return selected ? 'selected' : 'default'
}

/**
 * The outcome of changing a cover. A refused image is a normal result, not an error,
 * so the screen can show its own message. `previous` is what Undo puts back.
 */
export const CoverChangeSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    coverPath: z.string(),
    coverSource: CoverSourceSchema,
    /** The image's own size, for the crop or bars note. */
    width: z.number(),
    height: z.number(),
    previous: z.object({ coverPath: z.string(), coverSource: CoverSourceSchema })
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not-image', 'too-large', 'unreadable', 'no-embedded'])
  })
])
export type CoverChange = z.infer<typeof CoverChangeSchema>
