import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
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
import type { ConfirmedGroup } from '@shared/grouping'
import type { ApprovalTag } from '@shared/approval'

export interface LibraryRow {
  id: number
  title: string
  description: string | null
  coverPath: string
  isGroup: boolean
  favourite: boolean
  reviewStatus: 'needs_review' | 'approved'
  variantCount: number
  tags: { id: number; label: string; categoryLabel: string }[]
}

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
    tags: { tagId: number; label: string; parentTagId: number | null; usageCount: number }[]
  }[] {
    const categories = this.getAllCategories()
    const allTags = this.db.select().from(tags).all()
    const usageRows = this.db
      .select({ tagId: mockupTags.tagId, count: sql<number>`count(*)` })
      .from(mockupTags)
      .groupBy(mockupTags.tagId)
      .all()
    const usageMap = new Map(usageRows.map((r) => [r.tagId, r.count]))

    return categories.map((cat) => ({
      categoryId: cat.id,
      categoryLabel: cat.label,
      tags: allTags
        .filter((t) => t.categoryId === cat.id)
        .map((t) => ({
          tagId: t.id,
          label: t.label,
          parentTagId: t.parentTagId,
          usageCount: usageMap.get(t.id) ?? 0
        }))
    }))
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
    for (const { mockupId } of affected) this.upsertSearchIndex(mockupId)
  }

  /** Move a tag to a different category. (No FTS change — category label isn't indexed.) */
  reassignTagCategory(tagId: number, categoryId: number): void {
    this.db.update(tags).set({ categoryId }).where(eq(tags.id, tagId)).run()
  }

  /** Set (or clear) a tag's roll-up parent. A non-null parent must be in the SAME category
   *  as the tag and must not be the tag itself. */
  setTagParent(tagId: number, parentTagId: number | null): void {
    if (parentTagId !== null) {
      if (parentTagId === tagId) throw new Error('A tag cannot be its own parent')
      const tag = this.db.select().from(tags).where(eq(tags.id, tagId)).get()
      if (!tag) throw new Error(`Tag ${tagId} not found`)
      const parent = this.db.select().from(tags).where(eq(tags.id, parentTagId)).get()
      if (!parent) throw new Error(`Parent tag ${parentTagId} not found`)
      if (parent.categoryId !== tag.categoryId) {
        throw new Error('Parent tag must belong to the same category as the tag')
      }
    }
    this.db.update(tags).set({ parentTagId }).where(eq(tags.id, tagId)).run()
  }

  /** Merge sourceTag into targetTag: re-point every association, dedupe, delete source, reindex FTS. */
  mergeTags(sourceTagId: number, targetTagId: number): { affectedMockups: number } {
    if (sourceTagId === targetTagId) throw new Error('Cannot merge a tag into itself')
    const source = this.db.select().from(tags).where(eq(tags.id, sourceTagId)).get()
    if (!source) throw new Error(`Source tag ${sourceTagId} not found`)
    const target = this.db.select().from(tags).where(eq(tags.id, targetTagId)).get()
    if (!target) throw new Error(`Target tag ${targetTagId} not found`)

    const affected = this.db
      .select({ mockupId: mockupTags.mockupId })
      .from(mockupTags)
      .where(eq(mockupTags.tagId, sourceTagId))
      .all()
      .map((r) => r.mockupId)

    this.db.transaction((tx) => {
      for (const mockupId of affected) {
        tx.insert(mockupTags).values({ mockupId, tagId: targetTagId }).onConflictDoNothing().run()
        tx.delete(mockupTags)
          .where(and(eq(mockupTags.mockupId, mockupId), eq(mockupTags.tagId, sourceTagId)))
          .run()
      }
      tx.delete(tags).where(eq(tags.id, sourceTagId)).run()
    })

    for (const mockupId of affected) this.upsertSearchIndex(mockupId)
    return { affectedMockups: affected.length }
  }

  /** Delete a tag; mockup_tags cascade-deletes. Reindex FTS for affected mockups. */
  deleteTag(tagId: number): { affectedMockups: number } {
    const affected = this.db
      .select({ mockupId: mockupTags.mockupId })
      .from(mockupTags)
      .where(eq(mockupTags.tagId, tagId))
      .all()
      .map((r) => r.mockupId)

    this.db.delete(tags).where(eq(tags.id, tagId)).run()

    for (const mockupId of affected) this.upsertSearchIndex(mockupId)
    return { affectedMockups: affected.length }
  }

  /** Delete an empty category. Throws if any tags still belong to it. */
  deleteCategory(categoryId: number): void {
    const remaining = this.db
      .select({ c: sql<number>`count(*)` })
      .from(tags)
      .where(eq(tags.categoryId, categoryId))
      .get()?.c ?? 0
    if (remaining > 0) throw new Error('category not empty')
    this.db.delete(tagCategories).where(eq(tagCategories.id, categoryId)).run()
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

  clearTagsForMockup(mockupId: number): void {
    this.db.delete(mockupTags).where(eq(mockupTags.mockupId, mockupId)).run()
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
    this.db
      .update(mockups)
      .set({ coverPath, coverSource })
      .where(eq(mockups.id, mockupId))
      .run()
  }

  getMockupsByGroupId(groupId: number): Mockup[] {
    return this.db.select().from(mockups).where(eq(mockups.groupId, groupId)).all()
  }

  getMockupsByBatchId(batchId: string): Mockup[] {
    return this.db
      .select()
      .from(mockups)
      .where(sql`json_extract(${mockups.importContext}, '$.batchId') = ${batchId}`)
      .all()
  }

  confirmGroupings(groups: ConfirmedGroup[], singletonIds: number[]): void {
    this.db.transaction((tx) => {
      for (const group of groups) {
        const [leaderId, ...memberIds] = group.memberIds
        if (leaderId === undefined) continue
        tx.update(mockups).set({ isGroup: true, groupId: null }).where(eq(mockups.id, leaderId)).run()
        for (const memberId of memberIds) {
          tx.update(mockups).set({ isGroup: false, groupId: leaderId }).where(eq(mockups.id, memberId)).run()
        }
      }
      for (const singletonId of singletonIds) {
        tx.update(mockups).set({ isGroup: false, groupId: null }).where(eq(mockups.id, singletonId)).run()
      }
    })
  }

  upsertSearchIndex(mockupId: number): void {
    const m = this.getMockup(mockupId)
    if (!m) return
    const tagLabels = this.getTagsForMockup(mockupId).map((t) => t.label).join(' ')
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
    this.db.run(
      sql`INSERT INTO mockups_fts(rowid, title, description, tags)
          VALUES (${mockupId}, ${m.title}, ${m.description ?? ''}, ${tagLabels})`
    )
  }

  removeSearchIndex(mockupId: number): void {
    this.db.run(sql`DELETE FROM mockups_fts WHERE rowid = ${mockupId}`)
  }

  rebuildSearchIndex(): void {
    this.db.run(sql`DELETE FROM mockups_fts`)
    const rows = this.db
      .select()
      .from(mockups)
      .where(and(eq(mockups.reviewStatus, 'approved'), isNull(mockups.deletedAt)))
      .all()
    for (const m of rows) this.upsertSearchIndex(m.id)
  }

  expandTagIds(tagIds: number[]): number[] {
    if (tagIds.length === 0) return []
    const children = this.db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.parentTagId, tagIds))
      .all()
    return [...new Set([...tagIds, ...children.map((c) => c.id)])]
  }

  getLibrary(opts: { tagIds?: number[]; query?: string; sort: 'date' | 'name' }): LibraryRow[] {
    const { tagIds = [], sort } = opts
    const rawQuery = opts.query?.trim() ?? ''

    let candidates = this.db
      .select()
      .from(mockups)
      .where(and(eq(mockups.reviewStatus, 'approved'), isNull(mockups.deletedAt), isNull(mockups.groupId)))
      .all()

    // FTS filter + rank map
    let ftsRankMap: Map<number, number> | null = null
    if (rawQuery) {
      const ftsTerms = rawQuery
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/[^a-zA-Z0-9\-_]/g, '') + '*')
        .filter((t) => t.length > 1)
        .join(' ')
      if (ftsTerms) {
        const ftsRows = this.db.all<{ rowid: number; rank: number }>(
          sql`SELECT rowid, rank FROM mockups_fts WHERE mockups_fts MATCH ${ftsTerms}`
        )
        ftsRankMap = new Map(ftsRows.map((r) => [r.rowid, r.rank]))
        candidates = candidates.filter((c) => ftsRankMap!.has(c.id))
      }
    }

    // Tag filter
    if (tagIds.length > 0) {
      const expandedIds = this.expandTagIds(tagIds)
      if (expandedIds.length > 0) {
        const taggedIds = new Set(
          this.db
            .select({ mockupId: mockupTags.mockupId })
            .from(mockupTags)
            .where(inArray(mockupTags.tagId, expandedIds))
            .all()
            .map((r) => r.mockupId)
        )
        candidates = candidates.filter((c) => taggedIds.has(c.id))
      }
    }

    // Sort: favourites first, then FTS rank / name / date
    candidates.sort((a, b) => {
      if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
      if (ftsRankMap) {
        return (ftsRankMap.get(a.id) ?? 0) - (ftsRankMap.get(b.id) ?? 0)
      }
      if (sort === 'name') return a.title.localeCompare(b.title)
      return b.createdAt.localeCompare(a.createdAt)
    })

    // Assemble rows (N+1 acceptable at this scale)
    const categoryMap = new Map(
      this.db.select().from(tagCategories).all().map((c) => [c.id, c.label])
    )

    return candidates.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      coverPath: m.coverPath,
      isGroup: m.isGroup,
      favourite: m.favourite,
      reviewStatus: m.reviewStatus,
      variantCount: this.getMockupsByGroupId(m.id).length,
      tags: this.getTagsForMockup(m.id).map((t) => ({
        id: t.id,
        label: t.label,
        categoryLabel: categoryMap.get(t.categoryId) ?? ''
      }))
    }))
  }

  getMockupDetail(id: number): {
    mockup: Mockup | undefined
    tags: { id: number; label: string; categoryLabel: string }[]
    variants: Mockup[]
  } {
    const mockup = this.getMockup(id)
    if (!mockup) return { mockup: undefined, tags: [], variants: [] }
    const categoryMap = new Map(
      this.db.select().from(tagCategories).all().map((c) => [c.id, c.label])
    )
    const tagList = this.getTagsForMockup(id).map((t) => ({
      id: t.id,
      label: t.label,
      categoryLabel: categoryMap.get(t.categoryId) ?? ''
    }))
    const variantList = mockup.isGroup
      ? this.getMockupsByGroupId(id).sort((a, b) => a.id - b.id)
      : []
    return { mockup, tags: tagList, variants: variantList }
  }

  getTrash(): LibraryRow[] {
    const trashed = this.db
      .select()
      .from(mockups)
      .where(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId)))
      .orderBy(desc(mockups.deletedAt))
      .all()
    const categoryMap = new Map(
      this.db.select().from(tagCategories).all().map((c) => [c.id, c.label])
    )
    return trashed.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      coverPath: m.coverPath,
      isGroup: m.isGroup,
      favourite: m.favourite,
      reviewStatus: m.reviewStatus,
      variantCount: this.getMockupsByGroupId(m.id).length,
      tags: this.getTagsForMockup(m.id).map((t) => ({
        id: t.id,
        label: t.label,
        categoryLabel: categoryMap.get(t.categoryId) ?? ''
      }))
    }))
  }

  getLibraryStats(): { total: number; favourites: number; groups: number; trashed: number } {
    const baseFilter = and(
      eq(mockups.reviewStatus, 'approved'),
      isNull(mockups.deletedAt),
      isNull(mockups.groupId)
    )
    const total = this.db.select({ c: sql<number>`count(*)` }).from(mockups).where(baseFilter).get()?.c ?? 0
    const favourites = this.db.select({ c: sql<number>`count(*)` }).from(mockups).where(and(baseFilter, eq(mockups.favourite, true))).get()?.c ?? 0
    const groups = this.db.select({ c: sql<number>`count(*)` }).from(mockups).where(and(baseFilter, eq(mockups.isGroup, true))).get()?.c ?? 0
    const trashed = this.db.select({ c: sql<number>`count(*)` }).from(mockups).where(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId))).get()?.c ?? 0
    return { total, favourites, groups, trashed }
  }

  moveToTrash(id: number): void {
    this.db.update(mockups).set({ deletedAt: new Date().toISOString() }).where(eq(mockups.id, id)).run()
    this.removeSearchIndex(id)
  }

  restore(id: number): void {
    this.db.update(mockups).set({ deletedAt: null }).where(eq(mockups.id, id)).run()
    const m = this.getMockup(id)
    if (m?.reviewStatus === 'approved') this.upsertSearchIndex(id)
  }

  updateMockupMeta(id: number, data: { title: string; description: string; tagIds: number[] }): void {
    this.db.update(mockups).set({ title: data.title, description: data.description }).where(eq(mockups.id, id)).run()
    this.clearTagsForMockup(id)
    for (const tagId of data.tagIds) this.addTagToMockup(id, tagId)
    this.upsertSearchIndex(id)
  }

  ungroupGroup(leaderId: number): void {
    this.db.transaction((tx) => {
      tx.update(mockups).set({ isGroup: false }).where(eq(mockups.id, leaderId)).run()
      tx.update(mockups).set({ groupId: null }).where(eq(mockups.groupId, leaderId)).run()
    })
  }

  collectGroupIds(leaderId: number): number[] {
    const members = this.getMockupsByGroupId(leaderId)
    return [leaderId, ...members.map((m) => m.id)]
  }

  deleteMockupsHard(ids: number[]): { libraryPath: string; coverPath: string }[] {
    // Collect paths and remove FTS entries before the transaction (FTS run() can't nest in tx)
    const paths: { libraryPath: string; coverPath: string }[] = []
    for (const id of ids) {
      const m = this.getMockup(id)
      if (m) {
        paths.push({ libraryPath: m.libraryPath, coverPath: m.coverPath })
        this.removeSearchIndex(id)
      }
    }
    this.db.transaction((tx) => {
      for (const id of ids) tx.delete(mockups).where(eq(mockups.id, id)).run()
    })
    return paths
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
}
