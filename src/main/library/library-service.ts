import { promises as fs } from 'node:fs'
import type { Repository } from '../db/repository'

export interface LibraryServiceDeps {
  openPath: (p: string) => Promise<string>
  exists: (p: string) => Promise<boolean>
}

/** Why a file didn't open. Never carries a path or the system's own message. */
export type OpenExternalResult = { opened: true } | { opened: false; reason: 'no-app' | 'failed' }

export class LibraryService {
  private deps: LibraryServiceDeps

  constructor(
    private repo: Repository,
    private libraryRoot: string,
    deps?: Partial<LibraryServiceDeps>
  ) {
    this.deps = {
      openPath: deps?.openPath ?? ((p) => import('electron').then((e) => e.shell.openPath(p))),
      exists: deps?.exists ?? ((p) => fs.access(p).then(() => true, () => false))
    }
  }

  /** Open a mockup's PSD in the app the system picks (Photoshop). A pile opens its top mockup. */
  async openExternal(id: number): Promise<OpenExternalResult> {
    const mockup = this.repo.mockups.getMockup(id)
    if (!mockup || !(await this.deps.exists(mockup.libraryPath))) {
      return { opened: false, reason: 'failed' }
    }
    try {
      // The system answers with an error string when nothing can open the file.
      const err = await this.deps.openPath(mockup.libraryPath)
      return err ? { opened: false, reason: 'no-app' } : { opened: true }
    } catch {
      return { opened: false, reason: 'failed' }
    }
  }
}
