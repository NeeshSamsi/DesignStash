import { promises as fs } from 'node:fs'
import type { TrashItem, TrashStats } from '@shared/inbox'
import type { Repository } from '../db/repository'
import { defaultAppFileOps, ensureSizes, removeAppCopies, type AppFileOps } from './app-files'

export interface TrashServiceDeps {
  rm: AppFileOps['rm']
  readdir: AppFileOps['readdir']
  rmdir: AppFileOps['rmdir']
  stat: (path: string) => Promise<{ size: number }>
  exists: (path: string) => Promise<boolean>
}

export interface RestoreResult {
  /** Now back in My Stash. Moving these to Trash again undoes the restore. */
  restoredIds: number[]
  /** Still in Trash because a PSD in the stash folder is gone. */
  missing: number[]
}

/** Trash: what is in it, bringing things back, and deleting for good. Only ids and counts leave this class, never paths. */
export class TrashService {
  private readonly deps: TrashServiceDeps

  constructor(
    private readonly repo: Repository,
    private readonly libraryRoot: string,
    deps?: Partial<TrashServiceDeps>
  ) {
    this.deps = {
      rm: deps?.rm ?? defaultAppFileOps.rm,
      readdir: deps?.readdir ?? defaultAppFileOps.readdir,
      rmdir: deps?.rmdir ?? defaultAppFileOps.rmdir,
      stat: deps?.stat ?? ((p) => fs.stat(p)),
      exists:
        deps?.exists ??
        ((p) =>
          fs.access(p).then(
            () => true,
            () => false
          ))
    }
  }

  async list(): Promise<TrashItem[]> {
    const entries = this.repo.trash.getTrashEntries()
    const items: TrashItem[] = []
    for (const { row, trashedAt, ids, origin } of entries) {
      items.push({ ...row, trashedAt, origin, sizeBytes: await this.bytesOf(ids) })
    }
    return items
  }

  async stats(): Promise<TrashStats> {
    const items = await this.list()
    return { count: items.length, bytes: items.reduce((sum, i) => sum + i.sizeBytes, 0) }
  }

  /** Bring piles and singles back. One whose PSD (or any pile member's) is gone stays in Trash. */
  async restore(ids: number[]): Promise<RestoreResult> {
    const wanted = new Set(ids)
    const restoredIds: number[] = []
    const missing: number[] = []
    for (const entry of this.repo.trash.getTrashEntries()) {
      if (!wanted.has(entry.row.id)) continue
      if (await this.allPsdsPresent(entry.ids)) restoredIds.push(entry.row.id)
      else missing.push(entry.row.id)
    }
    this.repo.trash.restoreMany(restoredIds)
    return { restoredIds, missing }
  }

  async restoreAll(): Promise<RestoreResult> {
    return this.restore(this.repo.trash.getTrashEntries().map((e) => e.row.id))
  }

  /** Delete everything in Trash for good. The screen asks first; this does not. */
  async empty(): Promise<{ deletedCount: number; bytesFreed: number }> {
    const entries = this.repo.trash.getTrashEntries()
    if (entries.length === 0) return { deletedCount: 0, bytesFreed: 0 }
    const { bytes } = await this.stats()
    await this.removeAll(entries.flatMap((e) => e.ids))
    return { deletedCount: entries.length, bytesFreed: bytes }
  }

  /** Delete piles or singles from Trash for good, or just their records when the PSD is already gone. */
  async deleteEntries(ids: number[]): Promise<{ deletedIds: number[]; skippedIds: number[] }> {
    const byId = new Map(this.repo.trash.getTrashEntries().map((e) => [e.row.id, e]))
    const found = [...new Set(ids)].filter((id) => byId.has(id))
    const deletedIds = found.flatMap((id) => byId.get(id)!.ids).sort((a, b) => a - b)
    await this.removeAll(deletedIds)
    return { deletedIds, skippedIds: ids.filter((id) => !byId.has(id)) }
  }

  private async removeAll(ids: number[]): Promise<void> {
    const removed = this.repo.trash.deleteMockupsHard(ids)
    await removeAppCopies(this.repo, this.libraryRoot, removed, this.deps)
  }

  private async bytesOf(ids: number[]): Promise<number> {
    const sizes = await ensureSizes(this.repo, this.deps.stat, ids)
    return [...sizes.values()].reduce<number>((sum, size) => sum + (size ?? 0), 0)
  }

  private async allPsdsPresent(ids: number[]): Promise<boolean> {
    for (const id of ids) {
      const m = this.repo.mockups.getMockup(id)
      if (!m || !(await this.deps.exists(m.libraryPath))) return false
    }
    return true
  }
}
