import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { copyHauls, copyJobs } from '../schema'
import type { CopyHaul, CopyJob } from '../schema'

export interface NewJob {
  sourcePath: string
  fileName: string
  folderTrail: string[]
  sizeBytes: number
}

/** A haul's state with the one thing that belongs to it: a pause always has a reason, nothing else does. */
export type HaulState =
  | { state: 'running' | 'done' | 'cancelled' | 'undone' }
  | { state: 'paused'; pauseReason: NonNullable<CopyHaul['pauseReason']> }

/** A job's state with its extras: a skip always has a reason and a done job always has its mockup. */
export type JobState =
  | { status: 'queued' | 'copying' }
  | { status: 'done'; mockupId: number }
  | { status: 'skipped'; skipReason: NonNullable<CopyJob['skipReason']> }

/** The copy queue's hauls and the per-file jobs inside them. */
export class CopyJobRepository {
  constructor(private readonly db: AppDatabase) {}

  createHaul(id: string, candidateImages: string[], notPsdCount: number): CopyHaul {
    return this.db
      .insert(copyHauls)
      .values({ id, candidateImages, notPsdCount })
      .returning()
      .get()
  }

  getHaul(id: string): CopyHaul | undefined {
    return this.db.select().from(copyHauls).where(eq(copyHauls.id, id)).get()
  }

  /** The haul that is still going (running, or paused and waiting for a retry). */
  getActiveHaul(): CopyHaul | undefined {
    return this.db
      .select()
      .from(copyHauls)
      .where(inArray(copyHauls.state, ['running', 'paused']))
      .orderBy(desc(copyHauls.createdAt), sql`${copyHauls}.rowid DESC`)
      .get()
  }

  getLatestHaul(): CopyHaul | undefined {
    return this.db.select().from(copyHauls).orderBy(desc(copyHauls.createdAt), sql`${copyHauls}.rowid DESC`).get()
  }

  /** Set the state and its pause reason as one value, so a reason can never outlive the pause. */
  setHaulState(id: string, next: HaulState): void {
    this.db
      .update(copyHauls)
      .set({
        state: next.state,
        pauseReason: next.state === 'paused' ? next.pauseReason : null,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(copyHauls.id, id))
      .run()
  }

  updateHaul(id: string, patch: Partial<Pick<CopyHaul, 'candidateImages' | 'notPsdCount'>>): void {
    this.db
      .update(copyHauls)
      .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(copyHauls.id, id))
      .run()
  }

  addJobs(haulId: string, jobs: NewJob[]): void {
    if (jobs.length === 0) return
    this.db
      .insert(copyJobs)
      .values(jobs.map((j) => ({
          haulId,
          sourcePath: j.sourcePath,
          fileName: j.fileName,
          folderTrail: j.folderTrail,
          sizeBytes: j.sizeBytes
        })))
      .run()
  }

  getJobs(haulId: string): CopyJob[] {
    return this.db.select().from(copyJobs).where(eq(copyJobs.haulId, haulId)).orderBy(asc(copyJobs.id)).all()
  }

  getJob(id: number): CopyJob | undefined {
    return this.db.select().from(copyJobs).where(eq(copyJobs.id, id)).get()
  }

  nextQueued(haulId: string): CopyJob | undefined {
    return this.db
      .select()
      .from(copyJobs)
      .where(and(eq(copyJobs.haulId, haulId), eq(copyJobs.status, 'queued')))
      .orderBy(asc(copyJobs.id))
      .get()
  }

  /**
   * Set the status with its skip reason and mockup as one value. A job that is handled, done or skipped,
   * no longer needs the way back to its file, so that is cleared with it.
   */
  setJobState(id: number, next: JobState): void {
    const handled = next.status === 'done' || next.status === 'skipped'
    this.db
      .update(copyJobs)
      .set({
        status: next.status,
        skipReason: next.status === 'skipped' ? next.skipReason : null,
        mockupId: next.status === 'done' ? next.mockupId : null,
        ...(handled ? { sourcePath: '' } : {}),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(copyJobs.id, id))
      .run()
  }

  updateJob(id: number, patch: Partial<Pick<CopyJob, 'sourcePath'>>): void {
    this.db
      .update(copyJobs)
      .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(copyJobs.id, id))
      .run()
  }

  /** The haul will not run again, so the files still waiting (or mid-copy) lose their way back. */
  forgetPendingSources(haulId: string): void {
    this.db
      .update(copyJobs)
      .set({ sourcePath: '', updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(copyJobs.haulId, haulId), inArray(copyJobs.status, ['queued', 'copying'])))
      .run()
  }

  /** After a restart a file that was mid-copy has to be done again. */
  resetCopying(haulId: string): void {
    this.db
      .update(copyJobs)
      .set({ status: 'queued' })
      .where(and(eq(copyJobs.haulId, haulId), eq(copyJobs.status, 'copying')))
      .run()
  }

  /** The mockups this haul landed. */
  landedMockupIds(haulId: string): number[] {
    return this.db
      .select({ mockupId: copyJobs.mockupId })
      .from(copyJobs)
      .where(and(eq(copyJobs.haulId, haulId), isNotNull(copyJobs.mockupId)))
      .orderBy(asc(copyJobs.id))
      .all()
      .flatMap((r) => (r.mockupId === null ? [] : [r.mockupId]))
  }
}
