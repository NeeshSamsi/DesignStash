import { and, asc, eq, isNull } from 'drizzle-orm'
import { SortBoardSchema, TO_SORT_BOARD, type SortBoard } from '@shared/grouping'
import type { AppDatabase } from '../connection'
import { mockups, sortBoards, type Mockup } from '../schema'

/**
 * The Sort board as the user left it, so Finish later from Sort can pick up where they stopped.
 * One board covers everything waiting in To sort, across imports. Nothing here touches the
 * mockups: piles only become real when they are confirmed.
 */
export class SortBoardRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Every mockup waiting in To sort, out of Trash, oldest first: what the board holds. */
  waiting(): Mockup[] {
    return this.db
      .select()
      .from(mockups)
      .where(and(eq(mockups.stage, 'to_sort'), isNull(mockups.deletedAt)))
      .orderBy(asc(mockups.id))
      .all()
  }

  /** Keeps the board, in place of any saved before, boards kept per import included. */
  save(board: SortBoard): void {
    const kept = { ...board, batchId: TO_SORT_BOARD }
    this.db.transaction((tx) => {
      tx.delete(sortBoards).run()
      tx.insert(sortBoards).values({ batchId: TO_SORT_BOARD, board: kept }).run()
    })
  }

  /**
   * The saved board, brought up to date with the library. Mockups that were trashed or already
   * left To sort drop out, a pile left with one mockup dissolves, and mockups that arrived since
   * stand alone. Null when nothing was saved, or nothing is left to sort.
   */
  load(): SortBoard | null {
    const saved = this.read()
    if (!saved) return null

    const waiting = new Set(this.waiting().map((m) => m.id))
    if (waiting.size === 0) {
      this.forget()
      return null
    }

    const placed = new Set<number>()
    const take = (ids: number[]) =>
      ids.filter((id) => waiting.has(id) && !placed.has(id) && placed.add(id))

    const groups: SortBoard['groups'] = []
    const singletonIds = take(saved.singletonIds)
    for (const group of saved.groups) {
      const members = take(group.memberIds)
      if (members.length >= 2) groups.push({ id: group.id, memberIds: members })
      else singletonIds.push(...members)
    }
    for (const id of waiting) if (!placed.has(id)) singletonIds.push(id)

    return { batchId: TO_SORT_BOARD, groups, singletonIds }
  }

  /**
   * Takes confirmed mockups off the saved board, leaving the rest as the user left it. A board
   * with none of its own mockups still waiting is forgotten, so later ones get suggested piles.
   */
  remove(ids: number[]): void {
    const saved = this.read()
    if (!saved) return
    const gone = new Set(ids)
    const keep = (list: number[]) => list.filter((id) => !gone.has(id))
    const groups = saved.groups.map((g) => ({ id: g.id, memberIds: keep(g.memberIds) }))
    const board: SortBoard = {
      batchId: TO_SORT_BOARD,
      groups: groups.filter((g) => g.memberIds.length >= 2),
      singletonIds: [
        ...keep(saved.singletonIds),
        ...groups.filter((g) => g.memberIds.length === 1).flatMap((g) => g.memberIds)
      ]
    }
    const waiting = new Set(this.waiting().map((m) => m.id))
    const left = [...board.groups.flatMap((g) => g.memberIds), ...board.singletonIds]
    if (left.some((id) => waiting.has(id))) this.save(board)
    else this.forget()
  }

  /**
   * What was saved, as one board. Boards kept per import before there was one board are read
   * together, oldest first; one that no longer parses is left out.
   */
  private read(): SortBoard | null {
    const rows = this.db
      .select()
      .from(sortBoards)
      .orderBy(asc(sortBoards.updatedAt), asc(sortBoards.batchId))
      .all()
    const boards = rows.flatMap((row) => {
      const parsed = SortBoardSchema.safeParse(row.board)
      return parsed.success ? [parsed.data] : []
    })
    if (boards.length === 0) {
      if (rows.length > 0) this.forget()
      return null
    }
    return {
      batchId: TO_SORT_BOARD,
      groups: boards.flatMap((b) => b.groups),
      singletonIds: boards.flatMap((b) => b.singletonIds)
    }
  }

  private forget(): void {
    this.db.delete(sortBoards).run()
  }
}
