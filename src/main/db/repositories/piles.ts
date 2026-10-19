import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockups } from '../schema'
import type { Mockup } from '../schema'
import type { ConfirmedGroup } from '@shared/grouping'

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
}
