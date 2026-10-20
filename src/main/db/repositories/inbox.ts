import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { InboxCounts, InboxStage } from '@shared/inbox'
import type { AppDatabase } from '../connection'
import { mockups } from '../schema'
import type { Mockup } from '../schema'
import type { LibraryQueryRepository, LibraryRow } from './library-query'
import type { PileRepository } from './piles'

export type InboxRow = LibraryRow & {
  stage: InboxStage
  aiStatus: Mockup['aiStatus']
  sizeBytes: number | null
}

/** To sort and To stash: mockups that are imported but not yet in My Stash. */
export class InboxRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly library: LibraryQueryRepository,
    private readonly piles: PileRepository
  ) {}

  /**
   * One stage's cards. To sort lists mockups in import order; To stash lists piles and
   * singles (members sit under their pile) in the order they were sorted.
   */
  list(stage: InboxStage): InboxRow[] {
    const found = this.db
      .select()
      .from(mockups)
      .where(and(eq(mockups.stage, stage), isNull(mockups.deletedAt), isNull(mockups.groupId)))
      .orderBy(...(stage === 'to_sort' ? [asc(mockups.id)] : [asc(mockups.sortedAt), asc(mockups.id)]))
      .all()
    const rows = this.library.toRows(found)
    return found.map((m, i) => ({
      ...rows[i]!,
      stage,
      aiStatus: m.aiStatus,
      sizeBytes: m.sizeBytes
    }))
  }

  getCounts(): InboxCounts {
    const count = (where: ReturnType<typeof and>): number =>
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockups)
        .where(where)
        .get()?.c ?? 0

    const live = isNull(mockups.deletedAt)
    return {
      toSort: count(and(live, eq(mockups.stage, 'to_sort'))),
      toStash: count(and(live, eq(mockups.stage, 'to_stash'), isNull(mockups.groupId))),
      sniffing: count(
        and(live, eq(mockups.stage, 'to_sort'), inArray(mockups.aiStatus, ['pending', 'sniffing']))
      ),
      trash: count(and(isNotNull(mockups.deletedAt), isNull(mockups.groupId)))
    }
  }

  /**
   * What a toss would remove: the given mockups still in an inbox, plus every member of a pile
   * among them. Anything already in My Stash, in Trash or gone is left out.
   */
  collectTossable(ids: number[]): { ids: number[]; skipped: number[] } {
    const wanted = [...new Set(ids)]
    const found = wanted.length
      ? this.db.select().from(mockups).where(inArray(mockups.id, wanted)).all()
      : []
    const tossable = found.filter((m) => m.stage !== 'stashed' && m.deletedAt === null)
    const tossableIds = new Set(tossable.map((m) => m.id))
    for (const m of tossable) {
      if (!m.isGroup) continue
      for (const member of this.piles.getMockupsByGroupId(m.id)) tossableIds.add(member.id)
    }
    return {
      ids: [...tossableIds],
      skipped: wanted.filter((id) => !tossable.some((m) => m.id === id))
    }
  }
}
