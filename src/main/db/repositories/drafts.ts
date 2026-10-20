import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { drafts, lookOverResume, mockups } from '../schema'
import type { Draft, Mockup } from '../schema'

export interface DraftFields {
  title: string
  description: string
  tagIds: number[]
  touched?: boolean
  checked?: boolean
}

/** Look it over: the drafts kept until a pile or a mockup is stashed, and where Finish later left off. */
export class DraftRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * What is waiting in To stash, in the order Look it over walks it: piles first, then mockups on
   * their own. Ones sent to the end with Skip for now come last, in the order they were skipped.
   */
  getQueueRoots(): Mockup[] {
    const roots = this.db
      .select({ m: mockups, skippedAt: drafts.skippedAt })
      .from(mockups)
      .leftJoin(drafts, eq(drafts.mockupId, mockups.id))
      .where(and(eq(mockups.stage, 'to_stash'), isNull(mockups.deletedAt), isNull(mockups.groupId)))
      .orderBy(
        desc(mockups.isGroup),
        sql`${drafts.skippedAt} IS NOT NULL`,
        asc(drafts.skippedAt),
        asc(mockups.sortedAt),
        asc(mockups.id)
      )
      .all()
    return roots.map((r) => r.m)
  }

  getDraft(mockupId: number): Draft | undefined {
    return this.db.select().from(drafts).where(eq(drafts.mockupId, mockupId)).get()
  }

  getDrafts(ids: number[]): Map<number, Draft> {
    if (ids.length === 0) return new Map()
    return new Map(
      this.db
        .select()
        .from(drafts)
        .where(inArray(drafts.mockupId, ids))
        .all()
        .map((d) => [d.mockupId, d])
    )
  }

  /** Make a draft if there isn't one. Returns the draft that is there. */
  ensureDraft(mockupId: number, defaults: DraftFields): Draft {
    this.db
      .insert(drafts)
      .values({
        mockupId,
        title: defaults.title,
        description: defaults.description,
        tagIds: defaults.tagIds,
        touched: defaults.touched ?? false,
        checked: defaults.checked ?? false
      })
      .onConflictDoNothing()
      .run()
    return this.getDraft(mockupId)!
  }

  updateDraft(mockupId: number, patch: Partial<DraftFields>): void {
    this.db
      .update(drafts)
      .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(drafts.mockupId, mockupId))
      .run()
  }

  /** Put a draft back exactly as it was (Undo of a stash). */
  restoreDraft(row: Draft): void {
    this.db.insert(drafts).values(row).onConflictDoUpdate({ target: drafts.mockupId, set: row }).run()
  }

  skip(mockupId: number, at: string): void {
    this.db.update(drafts).set({ skippedAt: at }).where(eq(drafts.mockupId, mockupId)).run()
  }

  deleteDrafts(ids: number[]): void {
    if (ids.length === 0) return
    this.db.delete(drafts).where(inArray(drafts.mockupId, ids)).run()
  }

  getResume(): { unitId: number; mockupId: number } | undefined {
    return this.db
      .select({ unitId: lookOverResume.unitId, mockupId: lookOverResume.mockupId })
      .from(lookOverResume)
      .orderBy(desc(lookOverResume.updatedAt), desc(lookOverResume.unitId))
      .get()
  }

  setResume(unitId: number, mockupId: number): void {
    this.db
      .insert(lookOverResume)
      .values({ unitId, mockupId })
      .onConflictDoUpdate({
        target: lookOverResume.unitId,
        set: { mockupId, updatedAt: sql`CURRENT_TIMESTAMP` }
      })
      .run()
  }

  clearResume(unitId: number): void {
    this.db.delete(lookOverResume).where(eq(lookOverResume.unitId, unitId)).run()
  }
}
