import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { fullTitle } from '@shared/pile-variation'
import type { AppDatabase } from '../connection'
import { mockups } from '../schema'
import type { Mockup, TrashOrigin } from '../schema'
import type { LibraryQueryRepository, LibraryRow } from './library-query'
import type { MockupRepository } from './mockups'
import { PLACE_ALONE, pileRole } from './piles'
import type { SearchRepository } from './search'

/** Where a mockup goes to Trash from: the inbox its stage says, or My Stash. */
const originOf = (m: Pick<Mockup, 'stage'>): TrashOrigin =>
  m.stage === 'to_sort' ? 'to-sort' : m.stage === 'to_stash' ? 'to-stash' : 'my-stash'

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

  /**
   * What is in Trash, newest first: each pile or single mockup once, with when it was trashed
   * and every id it covers (a pile's members come back and go with it).
   */
  getTrashEntries(): { row: LibraryRow; trashedAt: string; ids: number[]; origin: TrashOrigin }[] {
    const trashed = this.db
      .select()
      .from(mockups)
      .where(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId)))
      .orderBy(desc(mockups.deletedAt), desc(mockups.id))
      .all()
    const lookups = this.library.loadLookups(trashed.map((m) => m.id))
    const rows = this.library.toRows(trashed, lookups)
    return trashed.map((m, i) => ({
      row: rows[i]!,
      trashedAt: m.deletedAt!,
      ids: [m.id, ...(lookups.members.get(m.id) ?? [])],
      origin: m.trashOrigin ?? originOf(m)
    }))
  }

  moveToTrash(id: number): void {
    this.moveManyToTrash([id])
  }

  /**
   * Move several mockups (or piles) to Trash together, so they share one timestamp. Returns how many
   * moved. A mockup inside a pile leaves it first and lands in Trash on its own, since Trash lists
   * only rows outside a pile; one whose pile goes in the same move goes with the pile. Each keeps
   * where it came from (its stage's inbox, or My Stash); `origin: 'import'` marks an undone import's.
   */
  moveManyToTrash(ids: number[], options: { origin?: 'import' } = {}): number {
    const deletedAt = new Date().toISOString()
    const wanted = new Set(ids)
    return this.db.transaction((tx) => {
      let moved = 0
      for (const id of wanted) {
        const m = this.mockups.getMockup(id)
        if (!m) continue
        if (pileRole(m) === 'member') {
          if (wanted.has(m.groupId!)) continue
          this.leavePile(tx, m)
        }
        tx.update(mockups)
          .set({ deletedAt, trashOrigin: options.origin ?? originOf(m) })
          .where(eq(mockups.id, id))
          .run()
        this.search.removeSearchIndex(id)
        moved++
      }
      return moved
    })
  }

  /**
   * Take a member out of its pile, as Remove from pile does: it keeps its full title, and a pile
   * left with one mockup stops being a pile.
   */
  private leavePile(tx: Pick<AppDatabase, 'update'>, member: Mockup): void {
    const topId = member.groupId!
    const others = this.db
      .select({ id: mockups.id })
      .from(mockups)
      .where(eq(mockups.groupId, topId))
      .all()
      .filter((m) => m.id !== member.id)
    const top = others.length === 0 ? this.mockups.getMockup(topId) : undefined
    for (const m of top ? [member, top] : [member]) {
      tx.update(mockups)
        .set({
          ...PLACE_ALONE,
          ...(m.variation
            ? { title: fullTitle(m.title, { words: m.variation }), variation: null, variationSource: null }
            : {})
        })
        .where(eq(mockups.id, m.id))
        .run()
    }
    // The top's title changed: search knows it by the new one.
    if (top?.variation && top.stage === 'stashed' && top.deletedAt === null) {
      this.search.upsertSearchIndex(top.id)
    }
  }

  /** Bring several mockups (or piles) back from Trash, all or none. Returns how many came back. */
  restoreMany(ids: number[]): number {
    return this.db.transaction(() => {
      let restored = 0
      for (const id of new Set(ids)) {
        if (!this.mockups.getMockup(id)) continue
        this.restore(id)
        restored++
      }
      return restored
    })
  }

  /** Out of Trash, back where it was: its stage never changed, so a tossed one goes back to its inbox. */
  restore(id: number): void {
    this.db.update(mockups).set({ deletedAt: null, trashOrigin: null }).where(eq(mockups.id, id)).run()
    const m = this.mockups.getMockup(id)
    if (m?.stage === 'stashed') this.search.upsertSearchIndex(id)
  }

  deleteMockupsHard(ids: number[]): { id: number; libraryPath: string; coverPath: string }[] {
    // The search rows go in the same transaction, so a failed delete leaves search as it was.
    const paths: { id: number; libraryPath: string; coverPath: string }[] = []
    this.db.transaction((tx) => {
      for (const id of ids) {
        const m = this.mockups.getMockup(id)
        if (m) {
          paths.push({ id, libraryPath: m.libraryPath, coverPath: m.coverPath })
          this.search.removeSearchIndex(id)
        }
      }
      for (const id of ids) tx.delete(mockups).where(eq(mockups.id, id)).run()
    })
    return paths
  }
}
