import { join, basename, dirname, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import type { Repository } from '../db/repository'
import { resolveCover } from '../psd'
import type { ResolveCoverInput, CoverResolution } from '../psd/types'
import type { DriftReport, FoundFile, GoneRecord, RelinkOutcome } from '@shared/integrity'
import { isInside } from './app-files'

export interface IntegrityDeps {
  /** Recursive list of absolute file paths under dir. Default walks the real fs. */
  listFiles: (dir: string) => Promise<string[]>
  /** Whether a path exists on disk. Default fs.access-based. */
  exists: (p: string) => Promise<boolean>
  /** Cover resolution for an in-place orphan file. Default uses the real psd resolver. */
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
  /** File size in bytes. Throws when the file can't be read. */
  stat: (p: string) => Promise<{ size: number }>
  /** Remove a file. Already gone is fine. */
  rm: (p: string) => Promise<void>
  /** Copy a file to a new place, making its folder first. */
  copyInto: (from: string, to: string) => Promise<void>
  /** Ask the user for a PSD (the file dialog lives in the IPC layer). Null when they cancel. */
  pickFile: () => Promise<string | null>
  /** The ids the user chose to ignore. Persisted by the owner; kept in memory by default. */
  ignored: { get: () => string[]; set: (ids: string[]) => void }
}

/** How much the scan found that the user has not ignored. The items themselves come from `report()`. */
export interface IntegrityReport {
  /** Files on disk under Library/mockups with no matching DB row. */
  orphanFiles: number
  /** DB rows whose stored file is missing on disk. */
  orphanRecords: number
}

/** Every difference between the records and the disk, keyed by the opaque ids the renderer sees. */
interface Drift {
  found: Map<string, string>
  gone: Map<string, { mockupId: number; libraryPath: string }>
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

const PSD = /\.psd$/i

const foundId = (path: string): string =>
  `f${createHash('sha256').update(path).digest('hex').slice(0, 16)}`
const goneId = (mockupId: number): string => `m${mockupId}`

function memoryIgnored(): IntegrityDeps['ignored'] {
  let ids: string[] = []
  return { get: () => ids, set: (next) => void (ids = next) }
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
      resolveCover: deps?.resolveCover ?? resolveCover,
      stat: deps?.stat ?? ((p) => fs.stat(p)),
      rm: deps?.rm ?? ((p) => fs.rm(p, { force: true })),
      copyInto:
        deps?.copyInto ??
        (async (from, to) => {
          await fs.mkdir(dirname(to), { recursive: true })
          await fs.copyFile(from, to)
        }),
      pickFile: deps?.pickFile ?? (async () => null),
      ignored: deps?.ignored ?? memoryIgnored()
    }
  }

  /** Mockups live under <libraryRoot>/mockups/<uuid>/original.psd (matches ImportService). */
  private mockupsDir(): string {
    return join(this.libraryRoot, 'mockups')
  }

  async scan(): Promise<IntegrityReport> {
    const { found, gone } = this.visible(await this.drift(true))
    return { orphanFiles: found.size, orphanRecords: gone.size }
  }

  /**
   * Everything that differs between the records and the disk, ignored or not, so an id can be resolved
   * whatever its state. Files are everything under mockups/ except generated cover and thumb
   * derivatives. `skipIgnoredStat` leaves out missing records that are ignored without checking the
   * disk for them, for callers that only want what is visible.
   */
  private async drift(skipIgnoredStat = false): Promise<Drift> {
    const rows = this.repo.getAllLibraryPaths()
    const known = new Set(rows.map((p) => p.libraryPath))
    const found = new Map<string, string>()
    for (const f of await this.deps.listFiles(this.mockupsDir())) {
      if (GENERATED_FILE.test(basename(f)) || known.has(f)) continue
      found.set(foundId(f), f)
    }
    const ignored = new Set(this.deps.ignored.get())
    const gone = new Map<string, { mockupId: number; libraryPath: string }>()
    for (const row of rows) {
      if (skipIgnoredStat && ignored.has(goneId(row.mockupId))) continue
      if (!(await this.deps.exists(row.libraryPath))) gone.set(goneId(row.mockupId), row)
    }
    return { found, gone }
  }

  /** Only what the user has not chosen to ignore. */
  private visible({ found, gone }: Drift): Drift {
    const ignored = new Set(this.deps.ignored.get())
    const keep = <V>(m: Map<string, V>) => new Map([...m].filter(([id]) => !ignored.has(id)))
    return { found: keep(found), gone: keep(gone) }
  }

  /**
   * What the stash check found, for the renderer: display names, sizes and covers, with opaque ids.
   * A PSD's path and the stash folder never leave the main process. Ignored items are left out.
   */
  async report(): Promise<DriftReport> {
    const { found, gone } = this.visible(await this.drift(true))

    const foundItems: FoundFile[] = []
    for (const [id, path] of found) {
      let sizeBytes: number | null = null
      try {
        sizeBytes = (await this.deps.stat(path)).size
      } catch {
        // Unmeasured: the row still lists.
      }
      let coverPath: string | undefined
      try {
        const cover = await this.deps.resolveCover({
          psdPath: path,
          candidateImagePaths: [],
          outDir: join(this.libraryRoot, 'cache', id)
        })
        if (cover.source !== 'none') coverPath = cover.coverPath
      } catch {
        // A PSD we can't read still gets a row, without a cover.
      }
      foundItems.push({
        id,
        name: basename(path, extname(path)),
        sizeBytes,
        ...(coverPath ? { coverPath } : {})
      })
    }

    const goneItems: GoneRecord[] = []
    for (const [id, row] of gone) {
      const mockup = this.repo.getMockup(row.mockupId)
      if (!mockup) continue
      const hasCover = mockup.coverPath !== '' && (await this.deps.exists(mockup.coverPath))
      goneItems.push({
        id,
        name: mockup.title,
        ...(hasCover ? { coverPath: mockup.coverPath } : {})
      })
    }
    return { found: foundItems, gone: goneItems }
  }

  /** Put found files in To sort. The caller queues them for suggestions. Returns the new mockup ids. */
  async add(ids: string[]): Promise<{ mockupIds: number[] }> {
    const { found } = await this.drift()
    const mockupIds: number[] = []
    for (const id of new Set(ids)) {
      const path = found.get(id)
      if (!path) continue
      mockupIds.push((await this.addOrphanFile(path)).mockupId)
    }
    return { mockupIds }
  }

  async addAll(): Promise<{ mockupIds: number[] }> {
    const { found } = this.visible(await this.drift())
    return this.add([...found.keys()])
  }

  /** Undo an add: the records and their covers go. The PSD stays where it was. */
  async undoAdd(mockupIds: number[]): Promise<void> {
    const added = mockupIds.filter((id) => {
      const m = this.repo.getMockup(id)
      return m !== undefined && m.stage === 'to_sort' && m.deletedAt === null
    })
    const removed = this.repo.deleteMockupsHard(added)
    await this.removeCovers(removed)
  }

  /** Remove the records of mockups whose PSD is gone. Anything else in `ids` is skipped. */
  async remove(ids: string[]): Promise<{ removed: number }> {
    const { gone } = await this.drift()
    const mockupIds = [...new Set(ids)].flatMap((id) => {
      const row = gone.get(id)
      return row ? [row.mockupId] : []
    })
    const rows = this.repo.deleteMockupsHard(mockupIds)
    await this.removeCovers(rows)
    return { removed: rows.length }
  }

  async removeAll(): Promise<{ removed: number }> {
    const { gone } = this.visible(await this.drift())
    return this.remove([...gone.keys()])
  }

  /**
   * Point a mockup whose PSD went missing at the file the user picks. A PSD inside the stash
   * folder is used where it is; one from outside is copied in, so the stash keeps its own copies.
   */
  async relink(id: string): Promise<{ outcome: RelinkOutcome }> {
    const { gone } = await this.drift()
    const row = gone.get(id)
    if (!row) return { outcome: 'failed' }

    const picked = await this.deps.pickFile()
    if (picked === null) return { outcome: 'cancelled' }
    if (!PSD.test(picked)) return { outcome: 'not-psd' }
    if (this.repo.getAllLibraryPaths().some((p) => p.libraryPath === picked)) {
      return { outcome: 'already-in-stash' }
    }

    let target = picked
    try {
      if (!isInside(this.mockupsDir(), picked)) {
        target = join(this.mockupsDir(), randomUUID(), 'original.psd')
        await this.deps.copyInto(picked, target)
      }
      const { size } = await this.deps.stat(target)
      this.repo.updateMockup(row.mockupId, { libraryPath: target, sizeBytes: size })
    } catch {
      return { outcome: 'failed' }
    }
    return { outcome: 'relinked' }
  }

  /** Hide items from the stash check. Returns only what was newly ignored, so Undo puts back exactly that. */
  async ignore(ids: string[]): Promise<{ ignoredIds: string[] }> {
    const { found, gone } = await this.drift()
    const current = new Set(this.deps.ignored.get())
    const ignoredIds = [...new Set(ids)].filter(
      (id) => (found.has(id) || gone.has(id)) && !current.has(id)
    )
    this.deps.ignored.set([...current, ...ignoredIds])
    return { ignoredIds }
  }

  async ignoreAll(): Promise<{ ignoredIds: string[] }> {
    const { found, gone } = await this.drift()
    return this.ignore([...found.keys(), ...gone.keys()])
  }

  async unignore(ids: string[]): Promise<void> {
    const back = new Set(ids)
    this.deps.ignored.set(this.deps.ignored.get().filter((id) => !back.has(id)))
  }

  /** The cover and thumbnail beside it, only when they sit in the stash folder. Never the PSD. */
  private async removeCovers(rows: { coverPath: string }[]): Promise<void> {
    for (const { coverPath } of rows) {
      if (!coverPath) continue
      for (const path of [coverPath, join(dirname(coverPath), 'thumb.webp')]) {
        if (!isInside(this.libraryRoot, path)) continue
        try {
          await this.deps.rm(path)
        } catch {
          // Leaving a stray cover behind is better than failing the action.
        }
      }
    }
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
    const resolution = await this.deps
      .resolveCover({
        psdPath: filePath,
        candidateImagePaths: [],
        outDir: dirname(filePath)
      })
      // A PSD we can't read a preview from is still added, without a cover.
      .catch((): CoverResolution => ({ source: 'none' }))

    let sizeBytes: number | null = null
    try {
      sizeBytes = (await this.deps.stat(filePath)).size
    } catch {
      // Measured later, when the inbox lists it.
    }
    const coverPath = resolution.source === 'none' ? '' : resolution.coverPath
    const coverSource = resolution.source

    const mockup = this.repo.createMockup({
      title: basename(filePath, extname(filePath)),
      libraryPath: filePath,
      coverPath,
      coverSource,
      reviewStatus: 'needs_review',
      stage: 'to_sort',
      sizeBytes,
      importContext: {
        batchId: randomUUID(),
        folderTrail: [],
        originalFilename: basename(filePath)
      }
    })

    return { mockupId: mockup.id }
  }
}
