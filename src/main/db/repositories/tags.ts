import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { tags, mockupTags, tagCategories } from '../schema'
import type { Tag, NewTag, TagCategory } from '../schema'
import type { ApprovalTag } from '@shared/approval'
import type { CategorySnapshot, TagMatch, TagSnapshot } from '@shared/tags'
import type { MockupRepository } from './mockups'
import type { SearchRepository } from './search'

/** Two-tier taxonomy: categories and the tags inside them. */
export class TagRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly mockups: MockupRepository,
    private readonly search: SearchRepository
  ) {}

  // Categories
  getCategoryByLabel(label: string): TagCategory | undefined {
    return this.db.select().from(tagCategories).where(eq(tagCategories.label, label)).get()
  }

  createCategory(data: { label: string; isCanonical?: boolean }): TagCategory {
    return this.db.insert(tagCategories).values(data).returning().get()
  }

  getAllCategories(): TagCategory[] {
    return this.db.select().from(tagCategories).orderBy(tagCategories.sortOrder).all()
  }

  renameCategory(categoryId: number, label: string): void {
    this.db.update(tagCategories).set({ label }).where(eq(tagCategories.id, categoryId)).run()
  }

  // Tags
  getAllTags(): Tag[] {
    return this.db.select().from(tags).all()
  }

  /** Categories (ordered by sortOrder) each with their tags + per-tag usage counts. */
  getTagTree(): {
    categoryId: number
    categoryLabel: string
    tagCount: number
    tags: { tagId: number; label: string; usageCount: number }[]
  }[] {
    const categories = this.getAllCategories()
    const allTags = this.db.select().from(tags).all()
    const usageRows = this.db
      .select({ tagId: mockupTags.tagId, count: sql<number>`count(*)` })
      .from(mockupTags)
      .groupBy(mockupTags.tagId)
      .all()
    const usageMap = new Map(usageRows.map((r) => [r.tagId, r.count]))

    return categories.map((cat) => {
      const catTags = allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({
          tagId: t.id,
          label: t.label,
          usageCount: usageMap.get(t.id) ?? 0
        }))
      return {
        categoryId: cat.id,
        categoryLabel: cat.label,
        tagCount: catTags.length,
        tags: catTags
      }
    })
  }

  /** Count distinct mockups carrying the tag. (mockup_tags PK makes rows == distinct mockups.) */
  getTagUsageCount(tagId: number): number {
    return (
      this.db
        .select({ c: sql<number>`count(distinct ${mockupTags.mockupId})` })
        .from(mockupTags)
        .where(eq(mockupTags.tagId, tagId))
        .get()?.c ?? 0
    )
  }

  /** Rename a tag and re-index FTS for every mockup carrying it (tag label lives in mockups_fts). */
  renameTag(tagId: number, label: string): void {
    this.db.update(tags).set({ label }).where(eq(tags.id, tagId)).run()
    const affected = this.db
      .select({ mockupId: mockupTags.mockupId })
      .from(mockupTags)
      .where(eq(mockupTags.tagId, tagId))
      .all()
    for (const { mockupId } of affected) this.search.upsertSearchIndex(mockupId)
  }

  /** Move a tag to a different category. (No FTS change — category label isn't indexed.) */
  reassignTagCategory(tagId: number, categoryId: number): void {
    this.db.update(tags).set({ categoryId }).where(eq(tags.id, tagId)).run()
  }

  /** Mockups carrying a tag. */
  private mockupIdsForTag(tagId: number): number[] {
    return this.db
      .select({ mockupId: mockupTags.mockupId })
      .from(mockupTags)
      .where(eq(mockupTags.tagId, tagId))
      .all()
      .map((r) => r.mockupId)
  }

  private assertMergeable(sourceTagId: number, targetTagId: number): void {
    if (sourceTagId === targetTagId) throw new Error('Cannot merge a tag into itself')
    const source = this.db.select().from(tags).where(eq(tags.id, sourceTagId)).get()
    if (!source) throw new Error(`Source tag ${sourceTagId} not found`)
    const target = this.db.select().from(tags).where(eq(tags.id, targetTagId)).get()
    if (!target) throw new Error(`Target tag ${targetTagId} not found`)
  }

  /** How many mockups a merge would move, without merging (the Merge into… dialog). */
  previewMergeTags(sourceTagId: number, targetTagId: number): { affectedMockups: number } {
    this.assertMergeable(sourceTagId, targetTagId)
    return { affectedMockups: this.mockupIdsForTag(sourceTagId).length }
  }

  /** Merge sourceTag into targetTag: re-point every association, dedupe, delete source, reindex FTS. */
  mergeTags(sourceTagId: number, targetTagId: number): { affectedMockups: number } {
    this.assertMergeable(sourceTagId, targetTagId)
    const affected = this.mockupIdsForTag(sourceTagId)

    this.db.transaction((tx) => {
      for (const mockupId of affected) {
        tx.insert(mockupTags).values({ mockupId, tagId: targetTagId }).onConflictDoNothing().run()
        tx.delete(mockupTags)
          .where(and(eq(mockupTags.mockupId, mockupId), eq(mockupTags.tagId, sourceTagId)))
          .run()
      }
      tx.delete(tags).where(eq(tags.id, sourceTagId)).run()
    })

    for (const mockupId of affected) this.search.upsertSearchIndex(mockupId)
    return { affectedMockups: affected.length }
  }

  /**
   * Delete a tag; mockup_tags cascade-deletes. Reindex FTS for affected mockups.
   * Returns a snapshot so the delete can be undone with restoreTag.
   */
  deleteTag(tagId: number): { affectedMockups: number; snapshot: TagSnapshot } {
    const tag = this.db.select().from(tags).where(eq(tags.id, tagId)).get()
    if (!tag) throw new Error(`Tag ${tagId} not found`)
    const affected = this.mockupIdsForTag(tagId)

    this.db.delete(tags).where(eq(tags.id, tagId)).run()

    for (const mockupId of affected) this.search.upsertSearchIndex(mockupId)
    return {
      affectedMockups: affected.length,
      snapshot: {
        tag: {
          id: tag.id,
          label: tag.label,
          categoryId: tag.categoryId,
          isCanonical: tag.isCanonical,
          createdBy: tag.createdBy
        },
        mockupIds: affected
      }
    }
  }

  /**
   * Undo a tag delete: recreate the tag (or reuse a same-named one made since) and put it back
   * on every mockup that still exists.
   */
  restoreTag(snapshot: TagSnapshot): { tagId: number; restoredMockups: number } {
    const { tag } = snapshot
    const category = this.db
      .select()
      .from(tagCategories)
      .where(eq(tagCategories.id, tag.categoryId))
      .get()
    if (!category) throw new Error(`Category ${tag.categoryId} not found`)

    const tagId =
      this.getTagByLabel(tag.categoryId, tag.label)?.id ??
      this.db.insert(tags).values(tag).returning({ id: tags.id }).get().id

    const restored = snapshot.mockupIds.filter((id) => this.mockups.getMockup(id) !== undefined)
    for (const mockupId of restored) this.mockups.addTagToMockup(mockupId, tagId)
    for (const mockupId of restored) this.search.upsertSearchIndex(mockupId)
    return { tagId, restoredMockups: restored.length }
  }

  /**
   * Delete a category. A category with tags needs moveTagsTo: its tags move there (merging into
   * a same-named tag) and mockups keep them. Returns a snapshot of the category row for Undo.
   */
  deleteCategory(
    categoryId: number,
    moveTagsTo?: number
  ): { deleted: true; movedTags: number; snapshot: CategorySnapshot } {
    const category = this.db
      .select()
      .from(tagCategories)
      .where(eq(tagCategories.id, categoryId))
      .get()
    if (!category) throw new Error(`Category ${categoryId} not found`)

    const tagsIn = this.db.select().from(tags).where(eq(tags.categoryId, categoryId)).all()
    if (tagsIn.length > 0) {
      if (moveTagsTo === undefined) throw new Error('category not empty')
      if (moveTagsTo === categoryId) throw new Error('Cannot move tags into the same category')
      const target = this.db
        .select()
        .from(tagCategories)
        .where(eq(tagCategories.id, moveTagsTo))
        .get()
      if (!target) throw new Error(`Category ${moveTagsTo} not found`)

      for (const tag of tagsIn) {
        const clash = this.getTagByLabel(moveTagsTo, tag.label)
        if (clash) this.mergeTags(tag.id, clash.id)
        else this.reassignTagCategory(tag.id, moveTagsTo)
      }
    }

    this.db.delete(tagCategories).where(eq(tagCategories.id, categoryId)).run()
    return {
      deleted: true,
      movedTags: tagsIn.length,
      snapshot: {
        id: category.id,
        label: category.label,
        sortOrder: category.sortOrder,
        isCanonical: category.isCanonical
      }
    }
  }

  /** Undo deleting an empty category. */
  restoreCategory(snapshot: CategorySnapshot): { categoryId: number } {
    const row = this.db.insert(tagCategories).values(snapshot).returning().get()
    return { categoryId: row.id }
  }

  /** Tags with this name in any category, ignoring case and surrounding spaces. */
  findTagsByLabel(label: string): TagMatch[] {
    const wanted = label.trim().toLowerCase()
    if (!wanted) return []
    return this.db
      .select({
        tagId: tags.id,
        label: tags.label,
        categoryId: tagCategories.id,
        categoryLabel: tagCategories.label
      })
      .from(tags)
      .innerJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
      .where(sql`lower(${tags.label}) = ${wanted}`)
      .orderBy(tagCategories.sortOrder, tags.id)
      .all()
      .map((t) => ({ ...t, usageCount: this.getTagUsageCount(t.tagId) }))
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

  getApprovalTagsByIds(ids: number[]): ApprovalTag[] {
    if (ids.length === 0) return []
    const rows = this.db
      .select({
        tagId: tags.id,
        label: tags.label,
        categoryId: tagCategories.id,
        categoryLabel: tagCategories.label
      })
      .from(tags)
      .innerJoin(tagCategories, eq(tags.categoryId, tagCategories.id))
      .where(inArray(tags.id, ids))
      .all()
    const byId = new Map(rows.map((r) => [r.tagId, r]))
    const seen = new Set<number>()
    const result: ApprovalTag[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      const row = byId.get(id)
      if (row) result.push(row)
    }
    return result
  }
}
