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

  updateHaul(id: string, patch: Partial<Pick<CopyHaul, 'state' | 'pauseReason' | 'candidateImages' | 'notPsdCount'>>): void {
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

  updateJob(
    id: number,
    patch: Partial<Pick<CopyJob, 'status' | 'skipReason' | 'mockupId' | 'sourcePath'>>
  ): void {
    this.db
      .update(copyJobs)
      .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(copyJobs.id, id))
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
