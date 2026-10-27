import type { Repository } from '../db/repository'
import type { PileChange } from '../db/repositories/piles'
import { PileTitles } from './pile-titles'

export interface PileChangeResult {
  pileId: number
}

const toResult = (change: PileChange): PileChangeResult => ({ pileId: change.pileId })

/**
 * Pile actions for My Stash. Each is one entry in the undo history (the handlers record it). Titles
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

  disband(pileId: number): { freedIds: number[] } {
    const { freedIds } = this.repo.piles.disbandPile(pileId)
    this.titles.leave(freedIds)
    return { freedIds }
  }

  removeFromPile(
    pileId: number,
    mockupId: number
  ): { pileId: number | null; freedIds: number[] } {
    const { pileId: after, freedIds } = this.repo.piles.removeFromPile(pileId, mockupId)
    this.titles.leave(freedIds)
    return { pileId: after, freedIds }
  }
}
