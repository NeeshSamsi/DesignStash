import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { SortBoardSchema, type SortBoard } from '@shared/grouping'
import type { AppDatabase } from '../connection'
import { mockups, sortBoards } from '../schema'

/**
 * The Sort board as the user left it, so Finish later from Sort can pick up where they stopped.
 * One board per import batch. Nothing here touches the mockups: piles only become real when
 * they are confirmed.
 */
export class SortBoardRepository {
  constructor(private readonly db: AppDatabase) {}

  save(board: SortBoard): void {
    const now = new Date().toISOString()
    this.db
      .insert(sortBoards)
      .values({ batchId: board.batchId, board })
      .onConflictDoUpdate({ target: sortBoards.batchId, set: { board, updatedAt: now } })
      .run()
  }

  /**
   * The saved board, brought up to date with the library. Mockups that were trashed or already
   * left To sort drop out, a pile left with one mockup dissolves, and mockups that arrived since
   * stand alone. Null when nothing was saved, or nothing is left to sort.
   */
  load(batchId: string): SortBoard | null {
    const row = this.db.select().from(sortBoards).where(eq(sortBoards.batchId, batchId)).get()
    if (!row) return null
    const saved = SortBoardSchema.safeParse(row.board)
    if (!saved.success) {
      this.clear(batchId)
      return null
    }

    const waiting = new Set(
      this.db
        .select({ id: mockups.id })
        .from(mockups)
        .where(
          and(
            sql`json_extract(${mockups.importContext}, '$.batchId') = ${batchId}`,
            eq(mockups.stage, 'to_sort'),
            isNull(mockups.deletedAt)
          )
        )
        .orderBy(asc(mockups.id))
        .all()
        .map((r) => r.id)
    )
    if (waiting.size === 0) {
      this.clear(batchId)
      return null
    }

    const placed = new Set<number>()
    const take = (ids: number[]) =>
      ids.filter((id) => waiting.has(id) && !placed.has(id) && placed.add(id))

    const groups: SortBoard['groups'] = []
    const singletonIds = take(saved.data.singletonIds)
    for (const group of saved.data.groups) {
      const members = take(group.memberIds)
      if (members.length >= 2) groups.push({ id: group.id, memberIds: members })
      else singletonIds.push(...members)
    }
    for (const id of waiting) if (!placed.has(id)) singletonIds.push(id)

    return { batchId, groups, singletonIds }
  }

  clear(batchId: string): void {
    this.db.delete(sortBoards).where(eq(sortBoards.batchId, batchId)).run()
  }
}
