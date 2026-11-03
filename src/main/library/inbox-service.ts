import { promises as fs } from 'node:fs'
import type { InboxCounts, InboxItem, InboxStage } from '@shared/inbox'
import type { Repository } from '../db/repository'
import { ensureSizes } from './app-files'

export interface InboxServiceDeps {
  stat: (path: string) => Promise<{ size: number }>
}

/** To sort and To stash: what is waiting, how many, and tossing items out. */
export class InboxService {
  private readonly deps: InboxServiceDeps

  constructor(
    private readonly repo: Repository,
    deps?: Partial<InboxServiceDeps>
  ) {
    this.deps = { stat: deps?.stat ?? ((p) => fs.stat(p)) }
  }

  async list(stage: InboxStage): Promise<InboxItem[]> {
    const rows = this.repo.inbox.list(stage)
    const sizes = await ensureSizes(
      this.repo,
      this.deps.stat,
      rows.map((r) => r.id)
    )
    return rows.map((r) => ({ ...r, sizeBytes: sizes.get(r.id) ?? r.sizeBytes }))
  }

  counts(): InboxCounts {
    return this.repo.inbox.getCounts()
  }

  /**
   * Throw mockups out of an inbox, to Trash, marked with the inbox they came from, so Restore puts
   * them back there (design/specs/undo.md, Toss goes to Trash). The app's copies go only when
   * Trash is emptied; the files the user dropped in are never touched. Mockups already in My Stash
   * or Trash are skipped (they have their own ways out).
   */
  toss(ids: number[]): { tossedIds: number[]; skippedIds: number[] } {
    const { ids: tossedIds, skipped } = this.repo.inbox.collectTossable(ids)
    this.repo.trash.moveManyToTrash(tossedIds)
    return { tossedIds, skippedIds: skipped }
  }

  /** What a toss of `ids` would move to Trash: they and their piles' members, in an inbox. */
  tossable(ids: number[]): number[] {
    return this.repo.inbox.collectTossable(ids).ids
  }
}
