import { existsSync } from 'node:fs'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, tags, mockupTags, tagCategories } from '../schema'
import type { Mockup } from '../schema'
import type { MockupRepository } from './mockups'
import type { PileRepository } from './piles'
import type { SearchRepository } from './search'

export interface LibraryRow {
  id: number
  title: string
  description: string | null
  coverPath: string
  coverSource: Mockup['coverSource']
  /** The cover file is gone from disk (the card offers Replace cover). */
  coverMissing: boolean
  isGroup: boolean
  favourite: boolean
  reviewStatus: 'needs_review' | 'approved'
  createdAt: string
  /** Other mockups in the pile besides the top; 0 for a mockup on its own. */
  variantCount: number
  /** The pile's top mockup (the leader row itself); null for a mockup on its own. */
  topId: number | null
  tags: { id: number; label: string; categoryLabel: string }[]
}

/** Read models for My Stash: the filtered grid, the detail view and the counts. */
export class LibraryQueryRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly mockups: MockupRepository,
    private readonly piles: PileRepository,
    private readonly search: SearchRepository,
    private readonly fileExists: (path: string) => boolean = existsSync
  ) {}

  getLibrary(opts: {
    tagIds?: number[]
    categoryIds?: number[]
    query?: string
    starredOnly?: boolean
    sort: 'date' | 'name'
  }): LibraryRow[] {
    const { tagIds = [], categoryIds = [], sort } = opts
    const rawQuery = opts.query?.trim() ?? ''

    let candidates = this.db
      .select()
      .from(mockups)
      .where(
        and(
          eq(mockups.reviewStatus, 'approved'),
          isNull(mockups.deletedAt),
          isNull(mockups.groupId),
          ...(opts.starredOnly ? [eq(mockups.favourite, true)] : [])
        )
      )
      .all()

    // FTS filter + rank map
    const ftsRankMap = rawQuery ? this.search.rankMatches(rawQuery) : null
    if (ftsRankMap) candidates = candidates.filter((c) => ftsRankMap.has(c.id))

    // Tag filter: every picked tag must match (AND).
    for (const tagId of new Set(tagIds)) {
      const taggedIds = new Set(
        this.db
          .select({ mockupId: mockupTags.mockupId })
          .from(mockupTags)
          .where(eq(mockupTags.tagId, tagId))
          .all()
          .map((r) => r.mockupId)
      )
      candidates = candidates.filter((c) => taggedIds.has(c.id))
    }

    // Category filter: rolls up to every tag in the category; categories AND together.
    for (const categoryId of new Set(categoryIds)) {
      const inCategory = new Set(
        this.db
          .select({ mockupId: mockupTags.mockupId })
          .from(mockupTags)
          .innerJoin(tags, eq(tags.id, mockupTags.tagId))
          .where(eq(tags.categoryId, categoryId))
          .all()
          .map((r) => r.mockupId)
      )
      candidates = candidates.filter((c) => inCategory.has(c.id))
    }

    // Sort: FTS rank when searching, else name / date. Favourites don't jump the queue (Starred is its own view).
    candidates.sort((a, b) => {
      if (ftsRankMap) {
        return (ftsRankMap.get(a.id) ?? 0) - (ftsRankMap.get(b.id) ?? 0)
      }
      if (sort === 'name') return a.title.localeCompare(b.title)
      return b.createdAt.localeCompare(a.createdAt)
    })

    return this.toRows(candidates)
  }

  /** Assemble grid rows with variant counts and labelled tags (N+1 acceptable at this scale). */
  toRows(list: Mockup[]): LibraryRow[] {
    const categoryMap = this.categoryLabels()
    return list.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      coverPath: m.coverPath,
      coverSource: m.coverSource,
      coverMissing: !this.fileExists(m.coverPath),
      isGroup: m.isGroup,
      favourite: m.favourite,
      reviewStatus: m.reviewStatus,
      createdAt: m.createdAt,
      variantCount: this.piles.getMockupsByGroupId(m.id).length,
      topId: m.isGroup ? m.id : null,
      tags: this.mockups.getTagsForMockup(m.id).map((t) => ({
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
    const mockup = this.mockups.getMockup(id)
    if (!mockup) return { mockup: undefined, tags: [], variants: [] }
    const categoryMap = this.categoryLabels()
    const tagList = this.mockups.getTagsForMockup(id).map((t) => ({
      id: t.id,
      label: t.label,
      categoryLabel: categoryMap.get(t.categoryId) ?? ''
    }))
    const variantList = mockup.isGroup
      ? this.piles.getMockupsByGroupId(id).sort((a, b) => a.id - b.id)
      : []
    return { mockup, tags: tagList, variants: variantList }
  }

  /** Every mockup in a pile for the Detail strip: the top first, then the rest in order. Empty for a mockup on its own. */
  getDetailVariants(id: number): {
    id: number
    title: string
    coverPath: string
    coverMissing: boolean
    coverSource: Mockup['coverSource']
    isTop: boolean
  }[] {
    const top = this.mockups.getMockup(id)
    if (!top?.isGroup) return []
    const rows = [top, ...this.piles.getMockupsByGroupId(id).sort((a, b) => a.id - b.id)]
    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      coverPath: m.coverPath,
      coverMissing: !this.fileExists(m.coverPath),
      coverSource: m.coverSource,
      isTop: m.id === top.id
    }))
  }

  getLibraryStats(): { total: number; favourites: number; groups: number; trashed: number } {
    const baseFilter = and(
      eq(mockups.reviewStatus, 'approved'),
      isNull(mockups.deletedAt),
      isNull(mockups.groupId)
    )
    const total =
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockups)
        .where(baseFilter)
        .get()?.c ?? 0
    const favourites =
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockups)
        .where(and(baseFilter, eq(mockups.favourite, true)))
        .get()?.c ?? 0
    const groups =
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockups)
        .where(and(baseFilter, eq(mockups.isGroup, true)))
        .get()?.c ?? 0
    const trashed =
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockups)
        .where(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId)))
        .get()?.c ?? 0
    return { total, favourites, groups, trashed }
  }

  private categoryLabels(): Map<number, string> {
    return new Map(
      this.db
        .select()
        .from(tagCategories)
        .all()
        .map((c) => [c.id, c.label])
    )
  }
}
