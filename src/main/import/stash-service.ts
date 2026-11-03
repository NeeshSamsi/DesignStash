import { promises as fs } from 'node:fs'
import type { StashResult, StashSnapshot } from '@shared/approval'
import type { Repository } from '../db/repository'
import type { LookOverService } from './look-over-service'

export interface StashDeps {
  exists: (path: string) => Promise<boolean>
}

const defaultDeps: StashDeps = { exists: (p) => fs.access(p).then(() => true, () => false) }

/**
 * Stash pile and Stash for a mockup on its own. A pile is committed whole: every draft is written
 * to its mockup in one transaction, so My Stash never holds half a pile. Undo hands back exactly
 * what was there before.
 */
export class StashService {
  private readonly deps: StashDeps

  constructor(
    private readonly repo: Repository,
    private readonly lookOver: LookOverService,
    deps?: Partial<StashDeps>
  ) {
    this.deps = { ...defaultDeps, ...deps }
  }

  async stashPile(pileId: number): Promise<StashResult> {
    const root = this.repo.mockups.getMockup(pileId)
    if (!root || !root.isGroup) return { ok: false, reason: 'not-ready', mockupIds: [pileId] }
    return this.stashUnit(pileId)
  }

  async stashSingle(mockupId: number): Promise<StashResult> {
    const m = this.repo.mockups.getMockup(mockupId)
    if (!m || m.isGroup || m.groupId !== null) return { ok: false, reason: 'not-ready', mockupIds: [mockupId] }
    return this.stashUnit(mockupId)
  }

  /** Undo a stash. Mockups deleted since are left out. */
  async unstash(snapshot: StashSnapshot): Promise<{ restoredIds: number[] }> {
    const restoredIds = this.repo.drafts.unstash(snapshot)
    for (const id of restoredIds) this.repo.search.removeSearchIndex(id)
    return { restoredIds }
  }

  private async stashUnit(unitId: number): Promise<StashResult> {
    const root = this.repo.mockups.getMockup(unitId)
    if (!root || root.deletedAt !== null || root.stage !== 'to_stash' || root.groupId !== null) {
      return { ok: false, reason: 'not-ready', mockupIds: [unitId] }
    }

    const members = await this.lookOver.draftsFor(unitId)
    const ids = members.map((m) => m.mockup.id)

    // A cover is required for every mockup, and a missing file counts as no cover.
    const noCover: number[] = []
    for (const { mockup } of members) {
      if (mockup.coverSource === 'none' || !(await this.deps.exists(mockup.coverPath))) noCover.push(mockup.id)
    }
    if (noCover.length > 0) return { ok: false, reason: 'no-cover', mockupIds: noCover }

    const snapshot = this.repo.drafts.stash(unitId, ids)
    // The search index can't be written inside the transaction.
    for (const id of ids) this.repo.search.upsertSearchIndex(id)
    return { ok: true, stashedIds: ids, snapshot }
  }
}
