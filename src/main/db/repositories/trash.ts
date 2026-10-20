import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups } from '../schema'
import type { LibraryQueryRepository, LibraryRow } from './library-query'
import type { MockupRepository } from './mockups'
import type { SearchRepository } from './search'

/** Soft delete (deletedAt), restore and permanent delete. */
export class TrashRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly mockups: MockupRepository,
    private readonly search: SearchRepository,
    private readonly library: LibraryQueryRepository
  ) {}

  getTrash(): LibraryRow[] {
    const trashed = this.db
      .select()
      .from(mockups)
      .where(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId)))
      .orderBy(desc(mockups.deletedAt))
      .all()
    return this.library.toRows(trashed)
  }

  moveToTrash(id: number): void {
    this.db
      .update(mockups)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(mockups.id, id))
      .run()
    this.search.removeSearchIndex(id)
  }

  /** Move several mockups (or piles) to Trash together, so they share one timestamp. Returns how many moved. */
  moveManyToTrash(ids: number[]): number {
    const deletedAt = new Date().toISOString()
    let moved = 0
    for (const id of new Set(ids)) {
      if (!this.mockups.getMockup(id)) continue
      this.db.update(mockups).set({ deletedAt }).where(eq(mockups.id, id)).run()
      this.search.removeSearchIndex(id)
      moved++
    }
    return moved
  }

  /** Bring several mockups (or piles) back from Trash. Returns how many came back. */
  restoreMany(ids: number[]): number {
    let restored = 0
    for (const id of new Set(ids)) {
      if (!this.mockups.getMockup(id)) continue
      this.restore(id)
      restored++
    }
    return restored
  }

  restore(id: number): void {
    this.db.update(mockups).set({ deletedAt: null }).where(eq(mockups.id, id)).run()
    const m = this.mockups.getMockup(id)
    if (m?.reviewStatus === 'approved') this.search.upsertSearchIndex(id)
  }

  deleteMockupsHard(ids: number[]): { libraryPath: string; coverPath: string }[] {
    // Collect paths and remove FTS entries before the transaction (FTS run() can't nest in tx)
    const paths: { libraryPath: string; coverPath: string }[] = []
    for (const id of ids) {
      const m = this.mockups.getMockup(id)
      if (m) {
        paths.push({ libraryPath: m.libraryPath, coverPath: m.coverPath })
        this.search.removeSearchIndex(id)
      }
    }
    this.db.transaction((tx) => {
      for (const id of ids) tx.delete(mockups).where(eq(mockups.id, id)).run()
    })
    return paths
  }
}
