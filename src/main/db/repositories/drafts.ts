import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { drafts, lookOverResume, mockupTags, mockups } from '../schema'
import type { StashSnapshot } from '@shared/approval'
import type { Draft, DraftField, Mockup } from '../schema'

export interface DraftFields {
  title: string
  description: string
  tagIds: number[]
  touched?: boolean
  checked?: boolean
  awaitingAi?: boolean
  keptFields?: DraftField[]
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
        checked: defaults.checked ?? false,
        awaitingAi: defaults.awaitingAi ?? false,
        keptFields: defaults.keptFields ?? []
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

  /**
   * Commit drafts to their mockups, all or nothing: title, description and tags are written, the
   * mockups become approved and stashed, and the drafts and the resume pointer go. Returns what
   * was there before, for Undo. The search index is the caller's job (it can't run inside this).
   */
  stash(unitId: number, ids: number[]): StashSnapshot {
    return this.db.transaction((tx) => {
      const rows = tx.select().from(mockups).where(inArray(mockups.id, ids)).all()
      const draftRows = tx.select().from(drafts).where(inArray(drafts.mockupId, ids)).all()
      const draftBy = new Map(draftRows.map((d) => [d.mockupId, d]))
      const tagRows = tx.select().from(mockupTags).where(inArray(mockupTags.mockupId, ids)).all()
      const resume = tx.select().from(lookOverResume).where(eq(lookOverResume.unitId, unitId)).get()

      const snapshot: StashSnapshot = {
        mockups: rows.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          tagIds: tagRows.filter((t) => t.mockupId === m.id).map((t) => t.tagId),
          stage: m.stage,
          sortedAt: m.sortedAt
        })),
        drafts: draftRows.map((d) => ({
          mockupId: d.mockupId,
          title: d.title,
          description: d.description,
          tagIds: d.tagIds,
          touched: d.touched,
          checked: d.checked,
          skippedAt: d.skippedAt
        })),
        resume: resume ? { unitId: resume.unitId, mockupId: resume.mockupId } : null
      }

      const now = new Date().toISOString()
      for (const m of rows) {
        const draft = draftBy.get(m.id)
        if (!draft) throw new Error(`Mockup ${m.id} has no draft`)
        tx.update(mockups)
          .set({
            title: draft.title,
            description: draft.description,
            stage: 'stashed',
            sortedAt: m.sortedAt ?? now
          })
          .where(eq(mockups.id, m.id))
          .run()
        tx.delete(mockupTags).where(eq(mockupTags.mockupId, m.id)).run()
        for (const tagId of new Set(draft.tagIds)) {
          tx.insert(mockupTags).values({ mockupId: m.id, tagId }).onConflictDoNothing().run()
        }
      }
      tx.delete(drafts).where(inArray(drafts.mockupId, ids)).run()
      tx.delete(lookOverResume).where(eq(lookOverResume.unitId, unitId)).run()
      return snapshot
    })
  }

  /** Undo a stash: every mockup, tag link, draft and the resume pointer go back as they were. */
  unstash(snapshot: StashSnapshot): number[] {
    return this.db.transaction((tx) => {
      const back: number[] = []
      for (const m of snapshot.mockups) {
        const exists = tx.select({ id: mockups.id }).from(mockups).where(eq(mockups.id, m.id)).get()
        if (!exists) continue
        tx.update(mockups)
          .set({
            title: m.title,
            description: m.description,
              stage: m.stage,
            sortedAt: m.sortedAt
          })
          .where(eq(mockups.id, m.id))
          .run()
        tx.delete(mockupTags).where(eq(mockupTags.mockupId, m.id)).run()
        for (const tagId of m.tagIds) {
          tx.insert(mockupTags).values({ mockupId: m.id, tagId }).onConflictDoNothing().run()
        }
        back.push(m.id)
      }
      for (const d of snapshot.drafts) {
        if (!back.includes(d.mockupId)) continue
        tx.insert(drafts).values(d).onConflictDoUpdate({ target: drafts.mockupId, set: d }).run()
      }
      if (snapshot.resume && back.includes(snapshot.resume.mockupId)) {
        tx.insert(lookOverResume)
          .values(snapshot.resume)
          .onConflictDoUpdate({ target: lookOverResume.unitId, set: { mockupId: snapshot.resume.mockupId } })
          .run()
      }
      return back
    })
  }
}
