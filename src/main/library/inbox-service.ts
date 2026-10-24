import { promises as fs } from 'node:fs'
import type { InboxCounts, InboxItem, InboxStage } from '@shared/inbox'
import type { Repository } from '../db/repository'
import { defaultAppFileOps, ensureSizes, removeAppCopies, type AppFileOps } from './app-files'

export interface InboxServiceDeps {
  rm: AppFileOps['rm']
  readdir: AppFileOps['readdir']
  rmdir: AppFileOps['rmdir']
  stat: (path: string) => Promise<{ size: number }>
}

/** To sort and To stash: what is waiting, how many, and tossing items out. */
export class InboxService {
  private readonly deps: InboxServiceDeps

  constructor(
    private readonly repo: Repository,
    private readonly libraryRoot: string,
    deps?: Partial<InboxServiceDeps>
  ) {
    this.deps = {
      rm: deps?.rm ?? defaultAppFileOps.rm,
      readdir: deps?.readdir ?? defaultAppFileOps.readdir,
      rmdir: deps?.rmdir ?? defaultAppFileOps.rmdir,
      stat: deps?.stat ?? ((p) => fs.stat(p))
    }
  }

  async list(stage: InboxStage): Promise<InboxItem[]> {
    const rows = this.repo.inbox.list(stage)
    const sizes = await ensureSizes(this.repo, this.deps.stat, rows.map((r) => r.id))
    return rows.map((r) => ({ ...r, sizeBytes: sizes.get(r.id) ?? r.sizeBytes }))
  }

  counts(): InboxCounts {
    return this.repo.inbox.getCounts()
  }

  /**
   * Throw mockups out of an inbox: their records and the app's copies go. The files the user
   * dropped in are never touched; the app doesn't even keep their paths. Mockups already in
   * My Stash or Trash are skipped (they have their own ways out).
   */
  async toss(ids: number[]): Promise<{ tossedIds: number[]; skippedIds: number[] }> {
    const { ids: tossedIds, skipped } = this.repo.inbox.collectTossable(ids)
    const removed = this.repo.trash.deleteMockupsHard(tossedIds)
    await removeAppCopies(this.repo, this.libraryRoot, removed, this.deps)
    return { tossedIds, skippedIds: skipped }
  }
}
