import { existsSync } from 'node:fs'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups, tags, mockupTags, tagCategories } from '../schema'
import type { Mockup } from '../schema'
import type { MockupRepository } from './mockups'
import { pileRole } from './piles'
import { isStashed } from './stashed'
import type { PileRepository } from './piles'
import type { SearchRepository } from './search'
import { MEANING_FLOOR, MEANING_TOP, meaningHits } from '../../search/meaning'
import type { Variation } from '@shared/pile-variation'

const variationOf = (m: Mockup): Variation | null =>
  m.variation ? { words: m.variation, source: m.variationSource ?? 'ai' } : null

export interface LibraryQueryOptions {
  tagIds?: number[]
  categoryIds?: number[]
  query?: string
  starredOnly?: boolean
  sort: 'date' | 'name'
  /** Cosine of the search to each mockup, from meaning search. Left out: keyword results only. */
  meaning?: ReadonlyMap<number, number> | null
}

export interface LibraryRow {
  id: number
  title: string
  description: string | null
  coverPath: string
  coverSource: Mockup['coverSource']
  /** The cover file is gone from disk (the card offers Replace cover). */
  coverMissing: boolean
  favourite: boolean
  createdAt: string
  /** Set when this row is a pile's top: `memberCount` counts the top too. Null for a mockup on its own. */
  pile: { memberCount: number } | null
  tags: { id: number; label: string; categoryLabel: string }[]
  /** The pile it's in (its top's id), or null on its own. In a pile `title` is the pile's base. */
  pileId: number | null
  /** Its own part of its title in a pile. */
  variation: Variation | null
}

type LabelledTag = { id: number; label: string; categoryLabel: string }

/** Tags and pile members for a set of mockups, read in one pass each. */
export interface RowLookups {
  /** Each mockup's tags in tag id order, with the id of the category each belongs to. */
  tags: Map<number, (LabelledTag & { categoryId: number })[]>
  /** The mockups pointing at each pile top through groupId, in id order. */
  members: Map<number, number[]>
}

/** Ids per `IN (...)` list, well under SQLite's variable limit. */
const LOOKUP_CHUNK = 500

/** Read models for My Stash: the filtered grid, the detail view and the counts. */
export class LibraryQueryRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly mockups: MockupRepository,
    private readonly piles: PileRepository,
    private readonly search: SearchRepository,
    private readonly fileExists: (path: string) => boolean = existsSync
  ) {}

  getLibrary(opts: LibraryQueryOptions): LibraryRow[] {
    return this.queryLibrary(opts).rows
  }

  /**
   * The library grid for a search, and whether meaning search added a result. Keyword hits come
   * first in rank order; then the closest meaning hit that keyword search did not find (`opts.meaning`,
   * mockup id to cosine, computed by the caller because embedding a query is asynchronous).
   */
  queryLibrary(opts: LibraryQueryOptions): { rows: LibraryRow[]; meaningHit: boolean } {
    const { tagIds = [], categoryIds = [], sort } = opts
    const rawQuery = opts.query?.trim() ?? ''

    let candidates = this.db
      .select()
      .from(mockups)
      .where(
        and(
          isStashed,
          isNull(mockups.deletedAt),
          isNull(mockups.groupId),
          ...(opts.starredOnly ? [eq(mockups.favourite, true)] : [])
        )
      )
      .all()

    // FTS filter + rank map. A hit on a mockup in a pile finds the pile: its top shows, ranked by
    // the best of its mockups, so a word only one variation has ("wavy") still finds it.
    const piles = rawQuery ? this.pileOfMembers() : new Map<number, number>()
    const ftsRankMap = rawQuery ? rollUp(this.search.rankMatches(rawQuery), piles, Math.min) : null
    const meaning = rollUp(opts.meaning ?? null, piles, Math.max)
    // The closest meaning hit among the mockups shown (a pile member is not one; its top is), then
    // dropped if keyword search found it already.
    const meaningIds =
      ftsRankMap && meaning
        ? meaningHits(
            new Map(
              candidates.flatMap((c) => {
                const sim = meaning.get(c.id)
                return sim === undefined ? [] : [[c.id, sim] as const]
              })
            ),
            { floor: MEANING_FLOOR, top: MEANING_TOP }
          ).filter((id) => !ftsRankMap.has(id))
        : []
    const meaningSet = new Set(meaningIds)
    if (ftsRankMap) candidates = candidates.filter((c) => ftsRankMap.has(c.id) || meaningSet.has(c.id))

    const lookups = this.loadLookups(candidates.map((c) => c.id))

    // Tag filter: every picked tag must match (AND).
    for (const tagId of new Set(tagIds)) {
      candidates = candidates.filter((c) => lookups.tags.get(c.id)?.some((t) => t.id === tagId))
    }

    // Category filter: rolls up to every tag in the category; categories AND together.
    for (const categoryId of new Set(categoryIds)) {
      candidates = candidates.filter((c) =>
        lookups.tags.get(c.id)?.some((t) => t.categoryId === categoryId)
      )
    }

    // Sort: FTS rank when searching, else name / date. Favourites don't jump the queue (Starred is its own view).
    candidates.sort((a, b) => {
      if (ftsRankMap) {
        // Keyword hits by rank; meaning hits after them, closest first.
        const ra = ftsRankMap.get(a.id)
        const rb = ftsRankMap.get(b.id)
        if (ra === undefined && rb === undefined) {
          return (meaning?.get(b.id) ?? 0) - (meaning?.get(a.id) ?? 0)
        }
        if (ra === undefined) return 1
        if (rb === undefined) return -1
        return ra - rb
      }
      if (sort === 'name') return a.title.localeCompare(b.title)
      return b.createdAt.localeCompare(a.createdAt)
    })

    return {
      rows: this.toRows(candidates, lookups),
      meaningHit: candidates.some((c) => meaningSet.has(c.id))
    }
  }

  /** Tags (with their category) and pile members for these mockups: two queries, however many ids. */
  loadLookups(ids: number[]): RowLookups {
    const tagMap: RowLookups['tags'] = new Map()
    const members: RowLookups['members'] = new Map()
    const unique = [...new Set(ids)]
    for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
      const chunk = unique.slice(i, i + LOOKUP_CHUNK)
      const tagRows = this.db
        .select({
          mockupId: mockupTags.mockupId,
          id: tags.id,
          label: tags.label,
          categoryId: tags.categoryId,
          categoryLabel: tagCategories.label
        })
        .from(mockupTags)
        .innerJoin(tags, eq(tags.id, mockupTags.tagId))
        .leftJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
        .where(inArray(mockupTags.mockupId, chunk))
        .orderBy(asc(mockupTags.mockupId), asc(mockupTags.tagId))
        .all()
      for (const r of tagRows) {
        const list = tagMap.get(r.mockupId) ?? []
        list.push({
          id: r.id,
          label: r.label,
          categoryId: r.categoryId,
          categoryLabel: r.categoryLabel ?? ''
        })
        tagMap.set(r.mockupId, list)
      }
      const memberRows = this.db
        .select({ id: mockups.id, groupId: mockups.groupId })
        .from(mockups)
        .where(inArray(mockups.groupId, chunk))
        .orderBy(asc(mockups.id))
        .all()
      for (const r of memberRows) {
        const list = members.get(r.groupId!) ?? []
        list.push(r.id)
        members.set(r.groupId!, list)
      }
    }
    return { tags: tagMap, members }
  }

  /** Each stashed mockup in a pile, by id, with its pile's top. */
  private pileOfMembers(): Map<number, number> {
    return new Map(
      this.db
        .select({ id: mockups.id, groupId: mockups.groupId })
        .from(mockups)
        .where(and(isStashed, isNull(mockups.deletedAt), isNotNull(mockups.groupId)))
        .all()
        .map((r) => [r.id, r.groupId!])
    )
  }

  /** Assemble grid rows with variant counts and labelled tags. */
  toRows(list: Mockup[], lookups = this.loadLookups(list.map((m) => m.id))): LibraryRow[] {
    return list.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description ?? null,
      coverPath: m.coverPath,
      coverSource: m.coverSource,
      coverMissing: !this.fileExists(m.coverPath),
      favourite: m.favourite,
      createdAt: m.createdAt,
      pile:
        pileRole(m) === 'top' ? { memberCount: (lookups.members.get(m.id)?.length ?? 0) + 1 } : null,
      tags: (lookups.tags.get(m.id) ?? []).map(({ id, label, categoryLabel }) => ({
        id,
        label,
        categoryLabel
      })),
      pileId: m.isGroup ? m.id : m.groupId,
      variation: variationOf(m)
    }))
  }

  getMockupDetail(id: number): {
    mockup: Mockup | undefined
    tags: { id: number; label: string; categoryLabel: string }[]
    variants: Mockup[]
  } {
    const mockup = this.mockups.getMockup(id)
    if (!mockup) return { mockup: undefined, tags: [], variants: [] }
    const tagList = (this.loadLookups([id]).tags.get(id) ?? []).map(
      ({ id: tagId, label, categoryLabel }) => ({ id: tagId, label, categoryLabel })
    )
    const variantList = pileRole(mockup) === 'top'
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
    variation: Variation | null
  }[] {
    const top = this.mockups.getMockup(id)
    if (!top || pileRole(top) !== 'top') return []
    const rows = [top, ...this.piles.getMockupsByGroupId(id).sort((a, b) => a.id - b.id)]
    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      coverPath: m.coverPath,
      coverMissing: !this.fileExists(m.coverPath),
      coverSource: m.coverSource,
      isTop: m.id === top.id,
      variation: variationOf(m)
    }))
  }

  getLibraryStats(): { total: number; favourites: number; groups: number; trashed: number } {
    const baseFilter = and(
      isStashed,
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
}

/** Scores by mockup with each pile's top given the best score of any mockup in it. */
function rollUp(
  scores: ReadonlyMap<number, number> | null,
  piles: ReadonlyMap<number, number>,
  best: (a: number, b: number) => number
): Map<number, number> | null {
  if (!scores) return null
  const out = new Map(scores)
  for (const [member, top] of piles) {
    const score = scores.get(member)
    if (score === undefined) continue
    const now = out.get(top)
    out.set(top, now === undefined ? score : best(now, score))
  }
  return out
}
