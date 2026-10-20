import type { PileSnapshot } from '@shared/ipc/pile'
import type { Repository } from '../db/repository'
import type { PileChange } from '../db/repositories/piles'

export interface PileChangeResult {
  pileId: number
  snapshot: PileSnapshot
}

const toResult = (change: PileChange): PileChangeResult => ({
  pileId: change.pileId,
  snapshot: { rows: change.before }
})

/** Pile actions for My Stash. Each returns the snapshot that Undo hands back to `restore`. */
export class PileService {
  constructor(private readonly repo: Repository) {}

  create(memberIds: number[], topId: number): PileChangeResult {
    return toResult(this.repo.createPile(memberIds, topId))
  }

  add(pileId: number, memberIds: number[]): PileChangeResult {
    return toResult(this.repo.addToPile(pileId, memberIds))
  }

  merge(sourceIds: number[], targetId: number): PileChangeResult {
    return toResult(this.repo.mergePiles(sourceIds, targetId))
  }

  setTop(pileId: number, topId: number): PileChangeResult {
    return toResult(this.repo.setPileTop(pileId, topId))
  }

  disband(pileId: number): { snapshot: PileSnapshot; freedIds: number[] } {
    const { before, freedIds } = this.repo.disbandPile(pileId)
    return { snapshot: { rows: before }, freedIds }
  }

  /** Undo: put every mockup in the snapshot back as it was. Mockups deleted since are skipped. */
  restore(snapshot: PileSnapshot): { restoredIds: number[] } {
    const existing = new Set(this.repo.getPileRows(snapshot.rows.map((r) => r.id)).map((r) => r.id))
    this.repo.restorePileRows(snapshot.rows)
    return { restoredIds: snapshot.rows.map((r) => r.id).filter((id) => existing.has(id)) }
  }
}
