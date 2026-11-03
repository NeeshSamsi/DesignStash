import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { drafts, lookOverResume, mockupTags, mockups, sortBoards, tagCategories, tags } from '../schema'
import type { Draft, Mockup, Tag, TagCategory } from '../schema'
import type { SearchRepository } from './search'

type ResumeRow = typeof lookOverResume.$inferSelect
type SortBoardRow = typeof sortBoards.$inferSelect

/** Which rows an undoable action can change (design/specs/undo.md). */
export interface StateScope {
  /** Each with its tags, its Look it over draft, and the resume point it is the unit of. */
  mockupIds?: number[]
  tagIds?: number[]
  categoryIds?: number[]
  /** The saved Sort board. */
  sortBoard?: boolean
}

/** Those rows as they are. `null` where there is none. */
export interface LibraryState {
  mockups: {
    id: number
    row: Mockup | null
    tagIds: number[]
    draft: Draft | null
    resume: ResumeRow | null
  }[]
  tags: { id: number; row: Tag | null }[]
  categories: { id: number; row: TagCategory | null }[]
  /** Every saved board row, or null when the board isn't in scope. */
  sortBoard: SortBoardRow[] | null
}

/** Fields to set on a row that is there, a whole row to put back, or a row to take away. */
export type RowChange<R> = { set: Partial<R> } | { put: R } | { remove: true }

/**
 * What turns one state into another, field by field: an undo or redo op's data. A field the action
 * didn't change isn't in it, so undoing a title edit never wipes a description the AI wrote since.
 */
export interface StateChange {
  mockups: {
    id: number
    row?: RowChange<Mockup>
    addTags?: number[]
    removeTags?: number[]
    draft?: RowChange<Draft>
    resume?: RowChange<ResumeRow>
  }[]
  tags: { id: number; row: RowChange<Tag> }[]
  categories: { id: number; row: RowChange<TagCategory> }[]
  /** The saved board's rows, in place of all there are. */
  sortBoard?: SortBoardRow[]
}

/** What a change couldn't find: a row it must set was deleted for good since. */
export type Missing = { kind: 'mockup' | 'tag' | 'category'; id: number }
export type ApplyOutcome = { ok: true } | { ok: false; missing: Missing }

/** Ids per `IN (...)` list, well under SQLite's variable limit. */
const CHUNK = 500

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const unique = (ids: number[] = []): number[] => [...new Set(ids)]

function rowChange<R extends object>(from: R | null, to: R | null): RowChange<R> | undefined {
  if (!from && !to) return undefined
  if (!to) return { remove: true }
  if (!from) return { put: to }
  const set: Partial<R> = {}
  for (const key of Object.keys(to) as (keyof R)[]) if (!same(from[key], to[key])) set[key] = to[key]
  return Object.keys(set).length > 0 ? { set } : undefined
}

/** The change that turns `from` into `to`. Both are captures of the same scope. */
export function diffState(from: LibraryState, to: LibraryState): StateChange {
  const byId = <E extends { id: number }>(list: E[]) => new Map(list.map((e) => [e.id, e]))
  const fromMockups = byId(from.mockups)
  const toMockups = byId(to.mockups)
  const mockupIds = unique([...fromMockups.keys(), ...toMockups.keys()])
  const none = { row: null, tagIds: [], draft: null, resume: null }

  const change: StateChange = { mockups: [], tags: [], categories: [] }
  for (const id of mockupIds) {
    const a = fromMockups.get(id) ?? { id, ...none }
    const b = toMockups.get(id) ?? { id, ...none }
    const entry: StateChange['mockups'][number] = { id }
    const row = rowChange(a.row, b.row)
    if (row) entry.row = row
    if (b.row) {
      const had = new Set(a.row ? a.tagIds : [])
      const has = new Set(b.tagIds)
      const addTags = b.tagIds.filter((t) => !had.has(t))
      const removeTags = a.row ? a.tagIds.filter((t) => !has.has(t)) : []
      if (addTags.length > 0) entry.addTags = addTags
      if (removeTags.length > 0) entry.removeTags = removeTags
      const draft = rowChange(a.draft, b.draft)
      if (draft) entry.draft = draft
      const resume = rowChange(a.resume, b.resume)
      if (resume) entry.resume = resume
    }
    if (Object.keys(entry).length > 1) change.mockups.push(entry)
  }

  const rows = <R extends object>(fromList: { id: number; row: R | null }[], toList: { id: number; row: R | null }[]) => {
    const a = new Map(fromList.map((e) => [e.id, e.row]))
    const b = new Map(toList.map((e) => [e.id, e.row]))
    return unique([...a.keys(), ...b.keys()]).flatMap((id) => {
      const row = rowChange(a.get(id) ?? null, b.get(id) ?? null)
      return row ? [{ id, row }] : []
    })
  }
  change.tags = rows(from.tags, to.tags)
  change.categories = rows(from.categories, to.categories)
  if (to.sortBoard && !same(from.sortBoard, to.sortBoard)) change.sortBoard = to.sortBoard
  return change
}

/** Whether a change does nothing. */
export const isEmptyChange = (c: StateChange): boolean =>
  c.mockups.length === 0 && c.tags.length === 0 && c.categories.length === 0 && c.sortBoard === undefined

/**
 * The rows undo and redo work on: read as they are (`capture`), and changed field by field, all at
 * once or not at all (`apply`). Search follows every mockup a change touched, as the actions keep it.
 */
export class UndoStateRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly search: SearchRepository
  ) {}

  capture(scope: StateScope): LibraryState {
    const mockupIds = unique(scope.mockupIds)
    const tagIds = unique(scope.tagIds)
    const categoryIds = unique(scope.categoryIds)

    const found = new Map<number, Mockup>()
    const links = new Map<number, number[]>()
    const draftRows = new Map<number, Draft>()
    const resumeRows = new Map<number, ResumeRow>()
    for (let i = 0; i < mockupIds.length; i += CHUNK) {
      const chunk = mockupIds.slice(i, i + CHUNK)
      for (const m of this.db.select().from(mockups).where(inArray(mockups.id, chunk)).all()) found.set(m.id, m)
      const tagRows = this.db.select().from(mockupTags).where(inArray(mockupTags.mockupId, chunk)).all()
      for (const l of tagRows) links.set(l.mockupId, [...(links.get(l.mockupId) ?? []), l.tagId])
      for (const d of this.db.select().from(drafts).where(inArray(drafts.mockupId, chunk)).all()) draftRows.set(d.mockupId, d)
      for (const r of this.db.select().from(lookOverResume).where(inArray(lookOverResume.unitId, chunk)).all()) {
        resumeRows.set(r.unitId, r)
      }
    }
    const tagRows = tagIds.length
      ? new Map(this.db.select().from(tags).where(inArray(tags.id, tagIds)).all().map((t) => [t.id, t]))
      : new Map<number, Tag>()
    const categoryRows = categoryIds.length
      ? new Map(
          this.db.select().from(tagCategories).where(inArray(tagCategories.id, categoryIds)).all().map((c) => [c.id, c])
        )
      : new Map<number, TagCategory>()

    return {
      mockups: mockupIds.map((id) => ({
        id,
        row: found.get(id) ?? null,
        tagIds: (links.get(id) ?? []).sort((a, b) => a - b),
        draft: draftRows.get(id) ?? null,
        resume: resumeRows.get(id) ?? null
      })),
      tags: tagIds.map((id) => ({ id, row: tagRows.get(id) ?? null })),
      categories: categoryIds.map((id) => ({ id, row: categoryRows.get(id) ?? null })),
      sortBoard: scope.sortBoard ? this.db.select().from(sortBoards).all() : null
    }
  }

  /** Applies a change in one transaction. A row it must set that is gone stops it before anything changes. */
  apply(change: StateChange): ApplyOutcome {
    const missing = this.findMissing(change)
    if (missing) return { ok: false, missing }

    this.db.transaction((tx) => {
      // Mockups linked to a tag whose label changes or goes: search reads tag labels.
      const touchedTags = change.tags.map((t) => t.id)
      const linked = touchedTags.length
        ? tx.select().from(mockupTags).where(inArray(mockupTags.tagId, touchedTags)).all().map((l) => l.mockupId)
        : []

      for (const { id, row } of change.categories) {
        if ('put' in row) this.upsert(tx, tagCategories, tagCategories.id, id, row.put)
        else if ('set' in row) tx.update(tagCategories).set(row.set).where(eq(tagCategories.id, id)).run()
      }
      for (const { id, row } of change.tags) {
        if ('put' in row) this.upsert(tx, tags, tags.id, id, row.put)
        else if ('set' in row) tx.update(tags).set(row.set).where(eq(tags.id, id)).run()
      }

      // Rows put back go in without their pile first, so a member never points at a top not in yet.
      const puts = change.mockups.flatMap((m) => (m.row && 'put' in m.row ? [m.row.put] : []))
      for (const row of puts) this.upsert(tx, mockups, mockups.id, row.id, { ...row, isGroup: false, groupId: null })
      for (const row of puts) {
        tx.update(mockups).set({ isGroup: row.isGroup, groupId: row.groupId }).where(eq(mockups.id, row.id)).run()
      }
      for (const m of change.mockups) {
        if (m.row && 'set' in m.row) tx.update(mockups).set(m.row.set).where(eq(mockups.id, m.id)).run()
      }

      for (const m of change.mockups) {
        for (const tagId of m.removeTags ?? []) {
          tx.delete(mockupTags).where(and(eq(mockupTags.mockupId, m.id), eq(mockupTags.tagId, tagId))).run()
        }
        for (const tagId of m.addTags ?? []) {
          tx.insert(mockupTags).values({ mockupId: m.id, tagId }).onConflictDoNothing().run()
        }
        if (m.draft) this.applyRow(tx, drafts, drafts.mockupId, m.id, m.draft)
        if (m.resume) this.applyRow(tx, lookOverResume, lookOverResume.unitId, m.id, m.resume)
      }

      if (change.sortBoard) {
        tx.delete(sortBoards).run()
        for (const row of change.sortBoard) tx.insert(sortBoards).values(row).run()
      }

      for (const m of change.mockups) if (m.row && 'remove' in m.row) tx.delete(mockups).where(eq(mockups.id, m.id)).run()
      for (const { id, row } of change.tags) if ('remove' in row) tx.delete(tags).where(eq(tags.id, id)).run()
      for (const { id, row } of change.categories) {
        if ('remove' in row) tx.delete(tagCategories).where(eq(tagCategories.id, id)).run()
      }

      for (const id of unique([...change.mockups.map((m) => m.id), ...linked])) this.syncSearch(id)
    })
    return { ok: true }
  }

  /** The first row the change must set (or link to) that isn't there and isn't put back by it. */
  private findMissing(change: StateChange): Missing | undefined {
    const exists = <T>(table: T, column: unknown, id: number) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.db.select().from(table as any).where(eq(column as any, id)).get() !== undefined
    const putCategories = new Set(change.categories.flatMap((c) => ('put' in c.row ? [c.id] : [])))
    const putTags = new Set(change.tags.flatMap((t) => ('put' in t.row ? [t.id] : [])))

    for (const { id, row } of change.categories) {
      if ('set' in row && !exists(tagCategories, tagCategories.id, id)) return { kind: 'category', id }
    }
    for (const { id, row } of change.tags) {
      if ('set' in row && !exists(tags, tags.id, id)) return { kind: 'tag', id }
      const categoryId = 'put' in row ? row.put.categoryId : 'set' in row ? row.set.categoryId : undefined
      if (categoryId !== undefined && !putCategories.has(categoryId) && !exists(tagCategories, tagCategories.id, categoryId)) {
        return { kind: 'category', id: categoryId }
      }
    }
    for (const m of change.mockups) {
      const putBack = m.row !== undefined && 'put' in m.row
      const takenAway = m.row !== undefined && 'remove' in m.row
      const needsRow = !putBack && !takenAway
      if (needsRow && !exists(mockups, mockups.id, m.id)) return { kind: 'mockup', id: m.id }
      for (const tagId of m.addTags ?? []) {
        if (!putTags.has(tagId) && !exists(tags, tags.id, tagId)) return { kind: 'tag', id: tagId }
      }
    }
    return undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private upsert(tx: any, table: any, key: any, id: number, row: object): void {
    if (tx.select().from(table).where(eq(key, id)).get()) tx.update(table).set(row).where(eq(key, id)).run()
    else tx.insert(table).values(row).run()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyRow(tx: any, table: any, key: any, id: number, change: RowChange<object>): void {
    if ('remove' in change) tx.delete(table).where(eq(key, id)).run()
    else if ('put' in change) this.upsert(tx, table, key, id, change.put)
    // A row the change sets but which went (a draft stashed since) stays gone.
    else tx.update(table).set(change.set).where(eq(key, id)).run()
  }

  /** Search knows a mockup while it's in My Stash and out of Trash, as the actions keep it. */
  private syncSearch(id: number): void {
    const m = this.db.select().from(mockups).where(eq(mockups.id, id)).get()
    if (m && m.stage === 'stashed' && m.deletedAt === null) this.search.upsertSearchIndex(id)
    else this.search.removeSearchIndex(id)
  }
}
