import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups } from '../schema'
import type { Mockup } from '../schema'
import type { ConfirmedGroup } from '@shared/grouping'

/** A row's place in a pile. Restoring these rows undoes any pile change. */
export interface PileRow {
  id: number
  isGroup: boolean
  groupId: number | null
}

export interface PileChange {
  /** The pile's id after the change (its top mockup). */
  pileId: number
  /** The earlier state of every row the change touched. */
  before: PileRow[]
}

/** Piles: a leader row (isGroup) and the members pointing at it through groupId. */
export class PileRepository {
  constructor(private readonly db: AppDatabase) {}

  getMockupsByGroupId(groupId: number): Mockup[] {
    return this.db.select().from(mockups).where(eq(mockups.groupId, groupId)).all()
  }

  confirmGroupings(groups: ConfirmedGroup[], singletonIds: number[]): void {
    this.db.transaction((tx) => {
      for (const group of groups) {
        const [leaderId, ...memberIds] = group.memberIds
        if (leaderId === undefined) continue
        tx.update(mockups)
          .set({ isGroup: true, groupId: null })
          .where(eq(mockups.id, leaderId))
          .run()
        for (const memberId of memberIds) {
          tx.update(mockups)
            .set({ isGroup: false, groupId: leaderId })
            .where(eq(mockups.id, memberId))
            .run()
        }
      }
      for (const singletonId of singletonIds) {
        tx.update(mockups)
          .set({ isGroup: false, groupId: null })
          .where(eq(mockups.id, singletonId))
          .run()
      }
    })
  }

  ungroupGroup(leaderId: number): void {
    this.db.transaction((tx) => {
      tx.update(mockups).set({ isGroup: false }).where(eq(mockups.id, leaderId)).run()
      tx.update(mockups).set({ groupId: null }).where(eq(mockups.groupId, leaderId)).run()
    })
  }

  collectGroupIds(leaderId: number): number[] {
    const members = this.getMockupsByGroupId(leaderId)
    return [leaderId, ...members.map((m) => m.id)]
  }

  /** The pile state of each existing row, in the order asked. */
  getPileRows(ids: number[]): PileRow[] {
    const found = new Map(
      this.db
        .select({ id: mockups.id, isGroup: mockups.isGroup, groupId: mockups.groupId })
        .from(mockups)
        .where(inArray(mockups.id, ids))
        .all()
        .map((r) => [r.id, r])
    )
    return ids.flatMap((id) => found.get(id) ?? [])
  }

  /** Put rows back as they were (Undo). Rows that were deleted since are skipped. */
  restorePileRows(rows: PileRow[]): void {
    this.db.transaction((tx) => {
      for (const row of rows) {
        tx.update(mockups)
          .set({ isGroup: row.isGroup, groupId: row.groupId })
          .where(eq(mockups.id, row.id))
          .run()
      }
    })
  }

  /** A pile from mockups on their own; `topId` becomes the leader. */
  createPile(memberIds: number[], topId: number): PileChange {
    const ids = [...new Set(memberIds)]
    if (ids.length !== memberIds.length) throw new Error('A mockup can only be in a pile once')
    if (ids.length < 2) throw new Error('A pile needs at least 2 mockups')
    if (!ids.includes(topId)) throw new Error('The top mockup must be in the pile')
    this.assertOnTheirOwn(ids)

    const before = this.getPileRows(ids)
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.update(mockups)
          .set(id === topId ? { isGroup: true, groupId: null } : { isGroup: false, groupId: topId })
          .where(eq(mockups.id, id))
          .run()
      }
    })
    return { pileId: topId, before }
  }

  /** Put mockups on their own into an existing pile; the top stays on top. */
  addToPile(pileId: number, memberIds: number[]): PileChange {
    const ids = [...new Set(memberIds)]
    if (ids.length === 0) throw new Error('Nothing to add to the pile')
    this.assertPile(pileId)
    this.assertOnTheirOwn(ids)

    const before = this.getPileRows(ids)
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.update(mockups).set({ isGroup: false, groupId: pileId }).where(eq(mockups.id, id)).run()
      }
    })
    return { pileId, before }
  }

  /**
   * Fold piles (or mockups on their own) into a target pile. The target keeps its top;
   * each source's top and members become members of the target.
   */
  mergePiles(sourceIds: number[], targetId: number): PileChange {
    const sources = [...new Set(sourceIds)]
    if (sources.length === 0) throw new Error('Nothing to merge into the pile')
    if (sources.includes(targetId)) throw new Error('A pile cannot be merged into itself')
    this.assertPile(targetId)

    const moving: number[] = []
    for (const id of sources) {
      const m = this.requireLive(id)
      if (m.isGroup) {
        moving.push(id, ...this.getMockupsByGroupId(id).map((x) => x.id))
      } else if (m.groupId === null) {
        moving.push(id)
      } else {
        throw new Error('Only piles and mockups on their own can be merged')
      }
    }

    const before = this.getPileRows(moving)
    this.db.transaction((tx) => {
      for (const id of moving) {
        tx.update(mockups)
          .set({ isGroup: false, groupId: targetId })
          .where(eq(mockups.id, id))
          .run()
      }
    })
    return { pileId: targetId, before }
  }

  /** Hand the pile to another of its mockups. The pile's id becomes `topId`. */
  setPileTop(pileId: number, topId: number): PileChange {
    this.assertPile(pileId)
    if (topId === pileId) return { pileId, before: [] }

    const members = this.getMockupsByGroupId(pileId)
    if (!members.some((m) => m.id === topId)) throw new Error('That mockup is not in the pile')

    const oldTop = this.requireLive(pileId)
    const ids = [pileId, ...members.map((m) => m.id)]
    const before = this.getPileRows(ids)
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.update(mockups)
          .set(id === topId ? { isGroup: true, groupId: null } : { isGroup: false, groupId: topId })
          .where(eq(mockups.id, id))
          .run()
      }
      // The star belongs to the pile, so it moves with the top.
      tx.update(mockups)
        .set({ favourite: oldTop.favourite, favouritedAt: oldTop.favouritedAt })
        .where(eq(mockups.id, topId))
        .run()
      tx.update(mockups)
        .set({ favourite: false, favouritedAt: null })
        .where(eq(mockups.id, pileId))
        .run()
    })
    return { pileId: topId, before }
  }

  /** Break a pile up: every mockup lands on its own. */
  disbandPile(pileId: number): PileChange & { freedIds: number[] } {
    this.assertPile(pileId)
    const freedIds = this.collectGroupIds(pileId)
    const before = this.getPileRows(freedIds)
    this.ungroupGroup(pileId)
    return { pileId, before, freedIds }
  }

  /**
   * Take one mockup out of a pile; it lands on its own. Removing the top promotes the next mockup (the
   * lowest id, the order the pile lists them). A pile left with one mockup stops being a pile. Each
   * mockup keeps its own star. `pileId` is the pile's id afterwards, or null when it no longer exists.
   */
  removeFromPile(
    pileId: number,
    mockupId: number
  ): { pileId: number | null; before: PileRow[]; freedIds: number[] } {
    this.assertPile(pileId)
    const members = this.getMockupsByGroupId(pileId).sort((a, b) => a.id - b.id)
    const inPile = mockupId === pileId || members.some((m) => m.id === mockupId)
    if (!inPile) throw new Error('That mockup is not in the pile')

    const all = [pileId, ...members.map((m) => m.id)]
    const before = this.getPileRows(all)
    const rest = all.filter((id) => id !== mockupId)

    // One left: no pile any more, both are on their own.
    if (rest.length < 2) {
      this.ungroupGroup(pileId)
      return { pileId: null, before, freedIds: all }
    }

    const newTop = mockupId === pileId ? (rest[0] as number) : pileId
    this.db.transaction((tx) => {
      tx.update(mockups)
        .set({ isGroup: false, groupId: null })
        .where(eq(mockups.id, mockupId))
        .run()
      for (const id of rest) {
        tx.update(mockups)
          .set(
            id === newTop ? { isGroup: true, groupId: null } : { isGroup: false, groupId: newTop }
          )
          .where(eq(mockups.id, id))
          .run()
      }
    })
    return { pileId: newTop, before, freedIds: [mockupId] }
  }

  private requireLive(id: number): Mockup {
    const m = this.db.select().from(mockups).where(eq(mockups.id, id)).get()
    if (!m || m.deletedAt !== null) throw new Error(`Mockup ${id} not found`)
    return m
  }

  private assertPile(id: number): void {
    const m = this.requireLive(id)
    if (!m.isGroup || m.groupId !== null) throw new Error(`Mockup ${id} is not a pile`)
  }

  private assertOnTheirOwn(ids: number[]): void {
    for (const id of ids) {
      const m = this.requireLive(id)
      if (m.isGroup || m.groupId !== null) throw new Error(`Mockup ${id} is already in a pile`)
    }
  }
}
