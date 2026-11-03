import { and, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { drafts, mockups, tags, mockupTags, tagCategories } from '../schema'
import type { Tag, NewTag, TagCategory } from '../schema'
import type { ApprovalTag } from '@shared/approval'
import { normaliseTagLabel, type TagMatch } from '@shared/tags'
import type { SearchRepository } from './search'

/** The handle inside a transaction. */
type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

/** A name another tag in the category, or another category, already reads as. Says what is there. */
export class NameTakenError extends Error {
  constructor(readonly taken: { label: string; categoryLabel?: string }) {
    super(
      taken.categoryLabel === undefined
        ? `There’s already a category called “${taken.label}”`
        : `“${taken.label}” is already a tag in ${taken.categoryLabel}`
    )
  }
}

/** How a suggestion is matched to a tag: its category and label, as `normaliseTagLabel` reads them. */
const suggestionKey = (category: string, label: string) =>
  `${normaliseTagLabel(category)}\u0000${normaliseTagLabel(label)}`

/** The tags an AI result (a mockup's `aiResult`) suggests, as keys. Anything else in it is ignored. */
function suggestedKeys(aiResult: unknown): string[] {
  const suggested = (aiResult as { tags?: unknown } | null)?.tags
  if (!Array.isArray(suggested)) return []
  return suggested.flatMap((t: { category?: unknown; label?: unknown }) =>
    typeof t?.category === 'string' && typeof t.label === 'string' ? [suggestionKey(t.category, t.label)] : []
  )
}

/**
 * Drop AI suggestions that never became tags (F-034): a suggestion no draft holds and no mockup still
 * waiting in an inbox suggests, then a category made for suggestions that has no tags left. A tag
 * that landed on a mockup, or that a person made, stays. A dismissed suggestion stays while its
 * mockup waits, so Undo in Look it over can bring it back.
 */
export function pruneSuggestions(db: Pick<AppDatabase, 'select' | 'delete'>): void {
  const suggestions = db
    .select({ id: tags.id, label: tags.label, category: tagCategories.label })
    .from(tags)
    .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
    .where(eq(tags.createdBy, 'suggestion'))
    .all()
  if (suggestions.length > 0) {
    const held = new Set(db.select({ tagIds: drafts.tagIds }).from(drafts).all().flatMap((d) => d.tagIds))
    const waiting = db
      .select({ aiResult: mockups.aiResult })
      .from(mockups)
      .where(and(inArray(mockups.stage, ['to_sort', 'to_stash']), isNull(mockups.deletedAt), isNotNull(mockups.aiResult)))
      .all()
    const named = new Set(waiting.flatMap((m) => suggestedKeys(m.aiResult)))
    const gone = suggestions
      .filter((t) => !held.has(t.id) && !named.has(suggestionKey(t.category, t.label)))
      .map((t) => t.id)
    if (gone.length > 0) db.delete(tags).where(inArray(tags.id, gone)).run()
  }
  db.delete(tagCategories)
    .where(
      and(
        eq(tagCategories.suggestion, true),
        notExists(db.select({ one: sql`1` }).from(tags).where(eq(tags.categoryId, tagCategories.id)))
      )
    )
    .run()
}

/** Two-tier taxonomy: categories and the tags inside them. */
export class TagRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly search: SearchRepository
  ) {}

  // Categories
  getCategoryByLabel(label: string): TagCategory | undefined {
    return this.db.select().from(tagCategories).where(eq(tagCategories.label, label)).get()
  }

  createCategory(data: { label: string; isCanonical?: boolean; suggestion?: boolean }): TagCategory {
    return this.db.insert(tagCategories).values(data).returning().get()
  }

  getAllCategories(): TagCategory[] {
    return this.db.select().from(tagCategories).orderBy(tagCategories.sortOrder).all()
  }

  /** Refuses a name another category reads the same as, whatever its casing. */
  renameCategory(categoryId: number, label: string): void {
    const category = this.db.select().from(tagCategories).where(eq(tagCategories.id, categoryId)).get()
    if (!category) throw new Error(`Category ${categoryId} not found`)
    const clash = this.getCategoryByNormalisedLabel(label)
    if (clash && clash.id !== categoryId) {
      throw new NameTakenError({ label: clash.label })
    }
    this.db.update(tagCategories).set({ label }).where(eq(tagCategories.id, categoryId)).run()
  }

  // Tags
  getAllTags(): Tag[] {
    return this.db.select().from(tags).all()
  }

  /**
   * Categories (ordered by sortOrder) each with their tags + per-tag usage counts: what Settings, the
   * tag filter and the tag matches list. AI suggestions aren't tags yet, so they're left out.
   */
  getTagTree(): {
    categoryId: number
    categoryLabel: string
    tagCount: number
    tags: { tagId: number; label: string; usageCount: number }[]
  }[] {
    const categories = this.getAllCategories().filter((c) => !c.suggestion)
    const allTags = this.getAllTags().filter((t) => t.createdBy !== 'suggestion')
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

  /**
   * Rename a tag and re-index FTS for every mockup carrying it (tag label lives in mockups_fts).
   * Refuses a name another tag in its category reads the same as.
   */
  renameTag(tagId: number, label: string): void {
    const tag = this.db.select().from(tags).where(eq(tags.id, tagId)).get()
    if (!tag) throw new Error(`Tag ${tagId} not found`)
    this.assertTagNameFree(tag.categoryId, label, tagId)
    // Search follows in the same transaction, so it never keeps the old name.
    this.db.transaction((tx) => {
      tx.update(tags).set({ label }).where(eq(tags.id, tagId)).run()
      for (const mockupId of this.mockupIdsForTag(tagId)) this.search.upsertSearchIndex(mockupId)
    })
  }

  /**
   * Move a tag to a different category. Search doesn't index category labels, so it stays as it is.
   * Refuses a category that already has a tag reading the same.
   */
  reassignTagCategory(tagId: number, categoryId: number): void {
    const tag = this.db.select().from(tags).where(eq(tags.id, tagId)).get()
    if (!tag) throw new Error(`Tag ${tagId} not found`)
    this.assertTagNameFree(categoryId, tag.label, tagId)
    this.db.update(tags).set({ categoryId }).where(eq(tags.id, tagId)).run()
  }

  /**
   * Two tags in one category never read the same (the unique index only catches an exact match,
   * so "iphone" next to "iPhone" would pass it). Throws in plain words when `label` is taken.
   */
  private assertTagNameFree(categoryId: number, label: string, tagId: number): void {
    const clash = this.getTagByNormalisedLabel(categoryId, label)
    if (!clash || clash.id === tagId) return
    const category = this.db
      .select({ label: tagCategories.label })
      .from(tagCategories)
      .where(eq(tagCategories.id, categoryId))
      .get()
    throw new NameTakenError({ label: clash.label, categoryLabel: category?.label ?? '' })
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
    const affected = this.db.transaction((tx) => {
      const moved = this.mergeInTx(tx, sourceTagId, targetTagId)
      for (const mockupId of moved) this.search.upsertSearchIndex(mockupId)
      return moved
    })
    return { affectedMockups: affected.length }
  }

  /** The merge itself, for a caller that already holds a transaction. Returns the mockups it touched. */
  private mergeInTx(tx: Tx, sourceTagId: number, targetTagId: number): number[] {
    const affected = this.mockupIdsForTag(sourceTagId)
    for (const mockupId of affected) {
      tx.insert(mockupTags).values({ mockupId, tagId: targetTagId }).onConflictDoNothing().run()
      tx.delete(mockupTags)
        .where(and(eq(mockupTags.mockupId, mockupId), eq(mockupTags.tagId, sourceTagId)))
        .run()
    }
    tx.delete(tags).where(eq(tags.id, sourceTagId)).run()
    return affected
  }

  /** Delete a tag; mockup_tags cascade-deletes. Reindex FTS for affected mockups. */
  deleteTag(tagId: number): { affectedMockups: number } {
    const tag = this.db.select().from(tags).where(eq(tags.id, tagId)).get()
    if (!tag) throw new Error(`Tag ${tagId} not found`)
    const affected = this.mockupIdsForTag(tagId)

    this.db.transaction((tx) => {
      tx.delete(tags).where(eq(tags.id, tagId)).run()
      for (const mockupId of affected) this.search.upsertSearchIndex(mockupId)
    })
    return { affectedMockups: affected.length }
  }

  /**
   * Delete a category. A category with tags needs moveTagsTo: its tags move there (merging into
   * a same-named tag) and mockups keep them.
   */
  deleteCategory(categoryId: number, moveTagsTo?: number): { deleted: true; movedTags: number } {
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

      // Every move, the delete and search are one transaction, so a failure leaves nothing half-moved.
      this.db.transaction((tx) => {
        const merged: number[] = []
        for (const tag of tagsIn) {
          const clash = this.getTagByNormalisedLabel(moveTagsTo, tag.label)
          if (clash) merged.push(...this.mergeInTx(tx, tag.id, clash.id))
          else tx.update(tags).set({ categoryId: moveTagsTo }).where(eq(tags.id, tag.id)).run()
        }
        tx.delete(tagCategories).where(eq(tagCategories.id, categoryId)).run()
        for (const mockupId of new Set(merged)) this.search.upsertSearchIndex(mockupId)
      })
    } else {
      this.db.delete(tagCategories).where(eq(tagCategories.id, categoryId)).run()
    }

    return { deleted: true, movedTags: tagsIn.length }
  }

  /**
   * A person adds a tag the AI only suggested so far: it's theirs now, so it is listed and never
   * pruned, and so is its category. Returns the tag as it is now.
   */
  claimTag(tag: Tag): Tag {
    this.claimCategory(tag.categoryId)
    if (tag.createdBy !== 'suggestion') return tag
    this.db.update(tags).set({ createdBy: 'user' }).where(eq(tags.id, tag.id)).run()
    return { ...tag, createdBy: 'user' }
  }

  /** A person adds a category the AI only suggested so far: it's theirs now. */
  claimCategory(categoryId: number): void {
    this.db
      .update(tagCategories)
      .set({ suggestion: false })
      .where(and(eq(tagCategories.id, categoryId), eq(tagCategories.suggestion, true)))
      .run()
  }

  /** Drop AI suggestions nothing suggests any more (see `pruneSuggestions`). */
  pruneSuggestions(): void {
    pruneSuggestions(this.db)
  }

  /**
   * Tags with this name in any category, compared as `normaliseTagLabel` does ("iphone" finds
   * "iPhone"). AI suggestions aren't tags yet, so they're left out.
   */
  findTagsByLabel(label: string): TagMatch[] {
    const wanted = normaliseTagLabel(label)
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
      .where(sql`${tags.createdBy} <> 'suggestion'`)
      .orderBy(tagCategories.sortOrder, tags.id)
      .all()
      .filter((t) => normaliseTagLabel(t.label) === wanted)
      .map((t) => ({ ...t, usageCount: this.getTagUsageCount(t.tagId) }))
  }

  /** The tag in this category that reads the same as `label`, whatever its casing or hyphens. */
  getTagByNormalisedLabel(categoryId: number, label: string): Tag | undefined {
    const wanted = normaliseTagLabel(label)
    if (!wanted) return undefined
    return this.db
      .select()
      .from(tags)
      .where(eq(tags.categoryId, categoryId))
      .orderBy(tags.id)
      .all()
      .find((t) => normaliseTagLabel(t.label) === wanted)
  }

  /** The category that reads the same as `label`, whatever its casing. */
  getCategoryByNormalisedLabel(label: string): TagCategory | undefined {
    const wanted = normaliseTagLabel(label)
    return this.db
      .select()
      .from(tagCategories)
      .all()
      .find((c) => normaliseTagLabel(c.label) === wanted)
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
