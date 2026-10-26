import type { PileSnapshot } from '@shared/ipc/pile'
import type { Repository } from '../db/repository'
import type { PileChange } from '../db/repositories/piles'
import { PileTitles } from './pile-titles'

export interface PileChangeResult {
  pileId: number
  snapshot: PileSnapshot
}

const toResult = (change: PileChange): PileChangeResult => ({
  pileId: change.pileId,
  snapshot: { rows: change.before }
})

/**
 * Pile actions for My Stash. Each returns the snapshot that Undo hands back to `restore`. Titles
 * follow the pile (design/specs/pile-titles.md): a mockup that joins takes the pile's base and its
 * file marker or number, keeping words a person typed, and one that leaves keeps its full title.
 */
export class PileService {
  private readonly titles: PileTitles

  constructor(private readonly repo: Repository) {
    this.titles = new PileTitles(repo)
  }

  create(memberIds: number[], topId: number): PileChangeResult {
    const change = this.repo.piles.createPile(memberIds, topId)
    this.titles.fill(change.pileId, memberIds)
    return toResult(change)
  }

  add(pileId: number, memberIds: number[]): PileChangeResult {
    const change = this.repo.piles.addToPile(pileId, memberIds)
    this.titles.fill(change.pileId, memberIds)
    return toResult(change)
  }

  merge(sourceIds: number[], targetId: number): PileChangeResult {
    const change = this.repo.piles.mergePiles(sourceIds, targetId)
    this.titles.fill(change.pileId, change.before.map((r) => r.id))
    return toResult(change)
  }

  setTop(pileId: number, topId: number): PileChangeResult {
    return toResult(this.repo.piles.setPileTop(pileId, topId))
  }

  disband(pileId: number): { snapshot: PileSnapshot; freedIds: number[] } {
    const { before, freedIds } = this.repo.piles.disbandPile(pileId)
    this.titles.leave(freedIds)
    return { snapshot: { rows: before }, freedIds }
  }

  removeFromPile(
    pileId: number,
    mockupId: number
  ): { pileId: number | null; snapshot: PileSnapshot; freedIds: number[] } {
    const { before, ...rest } = this.repo.piles.removeFromPile(pileId, mockupId)
    this.titles.leave(rest.freedIds)
    return { ...rest, snapshot: { rows: before } }
  }

  /** Undo: put every mockup in the snapshot back as it was. Mockups deleted since are skipped. */
  restore(snapshot: PileSnapshot): { restoredIds: number[] } {
    const existing = new Set(this.repo.piles.getPileRows(snapshot.rows.map((r) => r.id)).map((r) => r.id))
    this.repo.piles.restorePileRows(snapshot.rows)
    const restoredIds = snapshot.rows.map((r) => r.id).filter((id) => existing.has(id))
    // Their titles came back too: search knows them by their full titles.
    for (const id of restoredIds) {
      const m = this.repo.mockups.getMockup(id)
      if (m?.stage === 'stashed' && m.deletedAt === null) this.repo.search.upsertSearchIndex(id)
    }
    return { restoredIds }
  }
}
