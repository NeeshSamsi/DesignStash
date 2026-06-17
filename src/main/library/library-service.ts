import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { Repository } from '../db/repository'

export interface LibraryServiceDeps {
  openPath: (p: string) => Promise<string>
  rm: (p: string) => Promise<void>
  copyFile: (src: string, dest: string) => Promise<void>
  mkdir: (p: string) => Promise<void>
}

export class LibraryService {
  private deps: LibraryServiceDeps

  constructor(
    private repo: Repository,
    private libraryRoot: string,
    deps?: Partial<LibraryServiceDeps>
  ) {
    this.deps = {
      openPath: deps?.openPath ?? ((p) => import('electron').then((e) => e.shell.openPath(p))),
      rm: deps?.rm ?? ((p) => fs.rm(p, { force: true })),
      copyFile: deps?.copyFile ?? fs.copyFile,
      mkdir: deps?.mkdir ?? ((p) => fs.mkdir(p, { recursive: true }).then(() => undefined))
    }
  }

  async openExternal(id: number): Promise<{ opened: boolean }> {
    const mockup = this.repo.getMockup(id)
    if (!mockup) return { opened: false }
    const err = await this.deps.openPath(mockup.libraryPath)
    return { opened: !err }
  }

  async deletePermanently(id: number): Promise<{ deleted: true }> {
    const paths = this.repo.deleteMockupsHard([id])
    for (const p of paths) {
      await this.deps.rm(p.libraryPath)
      await this.deps.rm(p.coverPath)
    }
    return { deleted: true }
  }

  async deleteGroup(leaderId: number): Promise<{ deleted: true; removed: number }> {
    const ids = this.repo.collectGroupIds(leaderId)
    const paths = this.repo.deleteMockupsHard(ids)
    for (const p of paths) {
      await this.deps.rm(p.libraryPath)
      await this.deps.rm(p.coverPath)
    }
    return { deleted: true, removed: ids.length }
  }

  async duplicate(id: number): Promise<{ newMockupId: number }> {
    const res = this.repo.duplicateMockupRow(id)
    if (!res) throw new Error(`Mockup ${id} not found`)

    const destDir = join(this.libraryRoot, 'mockups', randomUUID())
    await this.deps.mkdir(destDir)

    const newLibraryPath = join(destDir, 'original.psd')
    const newCoverPath = join(destDir, basename(res.sourceCoverPath))

    await this.deps.copyFile(res.sourceLibraryPath, newLibraryPath)
    await this.deps.copyFile(res.sourceCoverPath, newCoverPath)

    this.repo.updateMockup(res.newId, { libraryPath: newLibraryPath, coverPath: newCoverPath })
    this.repo.upsertSearchIndex(res.newId)

    return { newMockupId: res.newId }
  }
}
