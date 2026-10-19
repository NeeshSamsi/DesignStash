import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, variants, tags, mockupTags } from '../schema'
import type { Mockup, NewMockup, Variant, NewVariant, Tag } from '../schema'
import type { SearchRepository } from './search'

/** Mockup rows, their variants and the tags on each mockup. */
export class MockupRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly search: SearchRepository
  ) {}

  createMockup(data: NewMockup): Mockup {
    return this.db.insert(mockups).values(data).returning().get()
  }

  getMockup(id: number): Mockup | undefined {
    return this.db.select().from(mockups).where(eq(mockups.id, id)).get()
  }

  /** Favourites first, then newest first (spec §3.5).
   *  @deprecated legacy — does not exclude soft-deleted; use getLibrary for the grid */
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

  /** All non-deleted mockups (leaders, members, singletons) with their stored libraryPath. Used by integrity scan. */
  getAllLibraryPaths(): { mockupId: number; libraryPath: string }[] {
    return this.db
      .select({ mockupId: mockups.id, libraryPath: mockups.libraryPath })
      .from(mockups)
      .where(isNull(mockups.deletedAt))
      .all()
  }

  mockupExistsByHash(hash: string): boolean {
    return !!this.db.select().from(mockups).where(eq(mockups.contentHash, hash)).get()
  }

  updateMockup(id: number, data: Partial<NewMockup>): void {
    this.db.update(mockups).set(data).where(eq(mockups.id, id)).run()
  }

  getMockupsByBatchId(batchId: string): Mockup[] {
    return this.db
      .select()
      .from(mockups)
      .where(sql`json_extract(${mockups.importContext}, '$.batchId') = ${batchId}`)
      .all()
  }

  approveItem(
    mockupId: number,
    data: {
      title: string
      description: string
      coverPath: string
      coverSource: 'embedded' | 'sidecar' | 'user-uploaded'
      reviewStatus: 'approved'
    }
  ): void {
    this.db
      .update(mockups)
      .set({
        title: data.title,
        description: data.description,
        coverPath: data.coverPath,
        coverSource: data.coverSource,
        reviewStatus: data.reviewStatus
      })
      .where(eq(mockups.id, mockupId))
      .run()
  }

  setMockupCover(mockupId: number, coverPath: string, coverSource: 'user-uploaded'): void {
    this.db.update(mockups).set({ coverPath, coverSource }).where(eq(mockups.id, mockupId)).run()
  }

  updateMockupMeta(
    id: number,
    data: { title: string; description: string; tagIds: number[] }
  ): void {
    this.db
      .update(mockups)
      .set({ title: data.title, description: data.description })
      .where(eq(mockups.id, id))
      .run()
    this.clearTagsForMockup(id)
    for (const tagId of data.tagIds) this.addTagToMockup(id, tagId)
    this.search.upsertSearchIndex(id)
  }

  duplicateMockupRow(
    id: number
  ): { newId: number; sourceLibraryPath: string; sourceCoverPath: string } | null {
    const m = this.getMockup(id)
    if (!m) return null
    const newRow = this.db
      .insert(mockups)
      .values({
        title: m.title,
        description: m.description ?? undefined,
        libraryPath: m.libraryPath,
        coverPath: m.coverPath,
        coverSource: m.coverSource,
        reviewStatus: m.reviewStatus,
        contentHash: m.contentHash ?? undefined,
        importContext: m.importContext ?? undefined,
        isGroup: false,
        groupId: null,
        favourite: false,
        favouritedAt: null,
        deletedAt: null
      })
      .returning()
      .get()
    const srcTags = this.getTagsForMockup(id)
    for (const t of srcTags) this.addTagToMockup(newRow.id, t.id)
    return { newId: newRow.id, sourceLibraryPath: m.libraryPath, sourceCoverPath: m.coverPath }
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

  // Tags on a mockup
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

  clearTagsForMockup(mockupId: number): void {
    this.db.delete(mockupTags).where(eq(mockupTags.mockupId, mockupId)).run()
  }
}
