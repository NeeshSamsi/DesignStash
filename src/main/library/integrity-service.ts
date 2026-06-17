import { join, basename, dirname, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Repository } from '../db/repository'
import type { NewMockup } from '../db/schema'
import { resolveCover } from '../psd'
import type { ResolveCoverInput, CoverResolution } from '../psd/types'

export interface IntegrityDeps {
  /** Recursive list of absolute file paths under dir. Default walks the real fs. */
  listFiles: (dir: string) => Promise<string[]>
  /** Whether a path exists on disk. Default fs.access-based. */
  exists: (p: string) => Promise<boolean>
  /** Cover resolution for an in-place orphan file. Default uses the real psd resolver. */
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
}

export interface IntegrityReport {
  /** Files on disk under Library/mockups with no matching DB row. */
  orphanFiles: string[]
  /** DB rows whose stored file is missing on disk. */
  orphanRecords: { mockupId: number; libraryPath: string }[]
}

/** Generated derivatives (covers/thumbnails) live alongside the stored asset and are NOT tracked as assets. */
const GENERATED_FILE = /^(cover|thumb)\.[^.]+$/i

async function defaultListFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await defaultListFiles(full)))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

async function defaultExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Detects drift between DB rows and the Library files on disk (spec §3.8). */
export class IntegrityService {
  private deps: IntegrityDeps

  constructor(
    private repo: Repository,
    private libraryRoot: string,
    deps?: Partial<IntegrityDeps>
  ) {
    this.deps = {
      listFiles: deps?.listFiles ?? defaultListFiles,
      exists: deps?.exists ?? defaultExists,
      resolveCover: deps?.resolveCover ?? resolveCover
    }
  }

  /** Mockups live under <libraryRoot>/mockups/<uuid>/original.psd (matches ImportService). */
  private mockupsDir(): string {
    return join(this.libraryRoot, 'mockups')
  }

  async scan(): Promise<IntegrityReport> {
    const dbPaths = this.repo.getAllLibraryPaths()
    const known = new Set(dbPaths.map((p) => p.libraryPath))

    // Disk asset files = everything under mockups/ except generated cover/thumb derivatives.
    const diskFiles = (await this.deps.listFiles(this.mockupsDir())).filter(
      (f) => !GENERATED_FILE.test(basename(f))
    )

    const orphanFiles = diskFiles.filter((f) => !known.has(f))

    const orphanRecords: { mockupId: number; libraryPath: string }[] = []
    for (const row of dbPaths) {
      if (!(await this.deps.exists(row.libraryPath))) orphanRecords.push(row)
    }

    return { orphanFiles, orphanRecords }
  }

  /** Hard-delete a dangling DB row whose file is gone. No file to touch. */
  deleteOrphanRecord(mockupId: number): void {
    this.repo.deleteMockup(mockupId)
    this.repo.removeSearchIndex(mockupId)
  }

  /**
   * Register an in-place orphan file as a new `needs_review` mockup WITHOUT copying it
   * (the file already lives under the library root). The new row carries a fresh batchId so
   * it flows through the existing grouping/approval views like a normal import.
   * Not FTS-indexed here — indexing happens on approval.
   */
  async addOrphanFile(filePath: string): Promise<{ mockupId: number }> {
    const resolution = await this.deps.resolveCover({
      psdPath: filePath,
      candidateImagePaths: [],
      outDir: dirname(filePath)
    })

    const coverPath = resolution.source === 'none' ? '' : resolution.coverPath
    // 'none' isn't in the DB enum's narrowed type but the column is plain text (no CHECK);
    // approval-service.toCoverSource maps it back to 'none' for the mandatory-preview gate.
    const coverSource = resolution.source as NewMockup['coverSource']

    const mockup = this.repo.createMockup({
      title: basename(filePath, extname(filePath)),
      libraryPath: filePath,
      coverPath,
      coverSource,
      reviewStatus: 'needs_review',
      importContext: { batchId: randomUUID(), folderTrail: [], originalFilename: basename(filePath) }
    })

    return { mockupId: mockup.id }
  }
}
