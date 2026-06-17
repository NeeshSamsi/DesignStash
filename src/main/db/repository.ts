import { and, desc, eq } from 'drizzle-orm'
import type { AppDatabase } from './connection'
import { mockups, variants, tags, mockupTags, tagCategories } from './schema'
import type {
  Mockup,
  NewMockup,
  Variant,
  NewVariant,
  Tag,
  NewTag,
  TagCategory
} from './schema'

/** Typed data-access layer over Drizzle. Keep all queries here. */
export class Repository {
  constructor(private readonly db: AppDatabase) {}

  // Mockups
  createMockup(data: NewMockup): Mockup {
    return this.db.insert(mockups).values(data).returning().get()
  }

  getMockup(id: number): Mockup | undefined {
    return this.db.select().from(mockups).where(eq(mockups.id, id)).get()
  }

  /** Favourites first, then newest first (spec §3.5). */
  getAllMockups(): Mockup[] {
    return this.db
      .select()
      .from(mockups)
      .orderBy(desc(mockups.favourite), desc(mockups.createdAt))
      .all()
  }

  deleteMockup(id: number): boolean {
    return this.db.delete(mockups).where(eq(mockups.id, id)).run().changes > 0
  }

  setFavourite(id: number, favourite: boolean): void {
    this.db
      .update(mockups)
      .set({ favourite, favouritedAt: favourite ? new Date().toISOString() : null })
      .where(eq(mockups.id, id))
      .run()
  }

  mockupExistsByHash(hash: string): boolean {
    return !!this.db.select().from(mockups).where(eq(mockups.contentHash, hash)).get()
  }

  updateMockup(id: number, data: Partial<NewMockup>): void {
    this.db.update(mockups).set(data).where(eq(mockups.id, id)).run()
  }

  // Variants
  createVariant(data: NewVariant): Variant {
    return this.db.insert(variants).values(data).returning().get()
  }

  getVariantsForMockup(mockupId: number): Variant[] {
    return this.db
      .select()
      .from(variants)
      .where(eq(variants.mockupId, mockupId))
      .orderBy(variants.position)
      .all()
  }

  // Categories
  getCategoryByLabel(label: string): TagCategory | undefined {
    return this.db.select().from(tagCategories).where(eq(tagCategories.label, label)).get()
  }

  createCategory(data: { label: string; isCanonical?: boolean }): TagCategory {
    return this.db.insert(tagCategories).values(data).returning().get()
  }

  // Tags
  getAllTags(): Tag[] {
    return this.db.select().from(tags).all()
  }

  getTagByLabel(categoryId: number, label: string): Tag | undefined {
    return this.db
      .select()
      .from(tags)
      .where(and(eq(tags.categoryId, categoryId), eq(tags.label, label)))
      .get()
  }

  createTag(data: NewTag): Tag {
    return this.db.insert(tags).values(data).returning().get()
  }

  getTagsForMockup(mockupId: number): Tag[] {
    return this.db
      .select()
      .from(tags)
      .innerJoin(mockupTags, eq(tags.id, mockupTags.tagId))
      .where(eq(mockupTags.mockupId, mockupId))
      .all()
      .map((row) => row.tags)
  }

  addTagToMockup(mockupId: number, tagId: number): void {
    this.db.insert(mockupTags).values({ mockupId, tagId }).onConflictDoNothing().run()
  }

  removeTagFromMockup(mockupId: number, tagId: number): void {
    this.db
      .delete(mockupTags)
      .where(and(eq(mockupTags.mockupId, mockupId), eq(mockupTags.tagId, tagId)))
      .run()
  }
}
