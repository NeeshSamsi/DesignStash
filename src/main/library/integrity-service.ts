import { join, basename, dirname, extname, relative } from 'node:path'
import { promises as fs } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import type { Repository } from '../db/repository'
import { resolveCover } from '../psd'
import { readEmbeddedPreviewInWorker } from '../psd/embedded-worker'
import type { ResolveCoverInput, CoverResolution } from '../psd/types'
import type { DriftReport, FoundFile, GoneRecord, RelinkOutcome } from '@shared/integrity'
import { defaultAppFileOps, isInside, removeAppCopies, type AppFileOps } from './app-files'

export interface IntegrityDeps {
  /** Recursive list of absolute file paths under dir. Default walks the real fs. */
  listFiles: (dir: string) => Promise<string[]>
  /** Whether a path exists on disk. Default fs.access-based. */
  exists: (p: string) => Promise<boolean>
  /** Cover resolution for an in-place orphan file. Default uses the real psd resolver, reading the PSD in a worker. */
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
  /** File size in bytes. Throws when the file can't be read. */
  stat: (p: string) => Promise<{ size: number }>
  /** Remove a file. Already gone is fine. */
  rm: (p: string) => Promise<void>
  /** A folder's names, none when it is missing. */
  readdir: AppFileOps['readdir']
  /** Remove a folder once it is empty. */
  rmdir: AppFileOps['rmdir']
  /** Copy a file to a new place, making its folder first. */
  copyInto: (from: string, to: string) => Promise<void>
  /** Ask the user for a PSD (the file dialog lives in the IPC layer). Null when they cancel. */
  pickFile: () => Promise<string | null>
  /** The ids the user chose to ignore. Persisted by the owner; kept in memory by default. */
  ignored: { get: () => string[]; set: (ids: string[]) => void }
  /** Remove a folder and everything in it. */
  removeFolder: (path: string) => Promise<void>
  /** How long the report waits for covers still being drawn. Those not ready show the next time. */
  coverWaitMs: number
}

/** Found files' covers drawn at once. Each reads a whole PSD's composite, in a worker of its own. */
const COVER_DRAWS_AT_ONCE = 2
/** Long enough for a handful of stray PSDs; a big batch shows the rest of its covers the next time. */
const COVER_WAIT_MS = 3000

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

/**
 * Only a PSD can turn up: the check looks for PSDs put in the stash folder by hand, which it can add
 * as mockups. Everything else beside a mockup is the app's own (cover, thumbnail, slot-mask.png, the
 * AI's masked covers) or not a mockup at all.
 */
const PSD = /\.psd$/i

const hashId = (text: string): string => `f${createHash('sha256').update(text).digest('hex').slice(0, 16)}`
/** A found file's id comes from its path inside the stash, so it stays the same when the stash moves. */
const foundId = (libraryRoot: string, path: string): string => hashId(relative(libraryRoot, path))
/** The id earlier versions gave it, from the whole path. */
const earlierFoundId = (path: string): string => hashId(path)
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
      resolveCover:
        deps?.resolveCover ??
        ((input) => resolveCover({ readEmbedded: readEmbeddedPreviewInWorker, ...input })),
      stat: deps?.stat ?? ((p) => fs.stat(p)),
      rm: deps?.rm ?? ((p) => fs.rm(p, { force: true })),
      readdir: deps?.readdir ?? defaultAppFileOps.readdir,
      rmdir: deps?.rmdir ?? defaultAppFileOps.rmdir,
      copyInto:
        deps?.copyInto ??
        (async (from, to) => {
          await fs.mkdir(dirname(to), { recursive: true })
          await fs.copyFile(from, to)
        }),
      pickFile: deps?.pickFile ?? (async () => null),
      ignored: deps?.ignored ?? memoryIgnored(),
      removeFolder: deps?.removeFolder ?? ((p) => fs.rm(p, { recursive: true, force: true })),
      coverWaitMs: deps?.coverWaitMs ?? COVER_WAIT_MS
    }
  }

  /** Covers being drawn or drawn for found files, by id: each is drawn once while its file is found. */
  private readonly covers = new Map<string, Promise<string | null>>()
  private drawingNow = 0
  private readonly waitingToDraw: (() => void)[] = []

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
   * whatever its state. Files are the PSDs under mockups/. `skipIgnoredStat` leaves out missing records that are ignored without checking the
   * disk for them, for callers that only want what is visible.
   */
  private async drift(skipIgnoredStat = false): Promise<Drift> {
    const rows = this.repo.mockups.getAllLibraryPaths()
    const known = new Set(rows.map((p) => p.libraryPath))
    const found = new Map<string, string>()
    for (const f of await this.deps.listFiles(this.mockupsDir())) {
      if (!PSD.test(f) || known.has(f)) continue
      found.set(foundId(this.libraryRoot, f), f)
    }
    this.keepEarlierIgnores(found)
    const ignored = new Set(this.deps.ignored.get())
    const gone = new Map<string, { mockupId: number; libraryPath: string }>()
    for (const row of rows) {
      if (skipIgnoredStat && ignored.has(goneId(row.mockupId))) continue
      if (!(await this.deps.exists(row.libraryPath))) gone.set(goneId(row.mockupId), row)
    }
    return { found, gone }
  }

  /** A file ignored under the id an earlier version gave it is ignored under its own id from now on. */
  private keepEarlierIgnores(found: Map<string, string>): void {
    const ignored = this.deps.ignored.get()
    if (ignored.length === 0) return
    const byEarlierId = new Map([...found].map(([id, path]) => [earlierFoundId(path), id]))
    if (!ignored.some((id) => byEarlierId.has(id))) return
    this.deps.ignored.set(ignored.map((id) => byEarlierId.get(id) ?? id))
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
    await this.clearCovers(new Set(found.keys()))
    const covers = await this.coversReady(found)

    const foundItems: FoundFile[] = []
    for (const [id, path] of found) {
      let sizeBytes: number | null = null
      try {
        sizeBytes = (await this.deps.stat(path)).size
      } catch {
        // Unmeasured: the row still lists.
      }
      // A PSD we can't read, or whose cover isn't drawn yet, still gets a row, without a cover.
      const coverPath = covers.get(id)
      foundItems.push({
        id,
        name: basename(path, extname(path)),
        sizeBytes,
        ...(coverPath ? { coverPath } : {})
      })
    }

    const goneItems: GoneRecord[] = []
    for (const [id, row] of gone) {
      const mockup = this.repo.mockups.getMockup(row.mockupId)
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

  private cacheDir(): string {
    return join(this.libraryRoot, 'cache')
  }

  /**
   * The found files' covers that are ready within `coverWaitMs`: those drawn before, then those drawn
   * now, a few at a time. One still being drawn when the time is up shows the next time the check opens.
   */
  private async coversReady(found: Map<string, string>): Promise<Map<string, string>> {
    const ready = new Map<string, string>()
    const drawn = [...found].map(([id, path]) =>
      this.coverFor(id, path).then((cover) => {
        if (cover) ready.set(id, cover)
      })
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.all(drawn),
      new Promise<void>((resolve) => (timer = setTimeout(resolve, this.deps.coverWaitMs)))
    ])
    clearTimeout(timer)
    return new Map(ready)
  }

  /** A found file's cover, under cache/<id>: the one drawn before, else drawn now. Null when it can't be. */
  private coverFor(id: string, path: string): Promise<string | null> {
    const known = this.covers.get(id)
    if (known) return known
    const outDir = join(this.cacheDir(), id)
    const cover = (async () => {
      const drawnBefore = join(outDir, 'cover.webp')
      if (await this.deps.exists(drawnBefore)) return drawnBefore
      await this.turnToDraw()
      try {
        const resolution = await this.deps.resolveCover({ psdPath: path, candidateImagePaths: [], outDir })
        return resolution.source === 'none' ? null : resolution.coverPath
      } catch {
        return null
      } finally {
        this.doneDrawing()
      }
    })()
    this.covers.set(id, cover)
    // A cover that couldn't be drawn is tried again the next time.
    void cover.then((drawn) => {
      if (drawn === null && this.covers.get(id) === cover) this.covers.delete(id)
    })
    return cover
  }

  private async turnToDraw(): Promise<void> {
    if (this.drawingNow < COVER_DRAWS_AT_ONCE) {
      this.drawingNow++
      return
    }
    // `doneDrawing` hands its turn straight over.
    await new Promise<void>((resolve) => this.waitingToDraw.push(resolve))
  }

  private doneDrawing(): void {
    const next = this.waitingToDraw.shift()
    if (next) next()
    else this.drawingNow--
  }

  /** Covers drawn for files no longer found: added, removed, ignored, or gone from the folder. */
  private async clearCovers(found: Set<string>): Promise<void> {
    for (const id of this.covers.keys()) if (!found.has(id)) this.covers.delete(id)
    const cache = this.cacheDir()
    const names = await this.deps.readdir(cache)
    for (const name of names) {
      if (found.has(name)) continue
      await this.deps.removeFolder(join(cache, name)).catch(() => {})
    }
    if (found.size === 0 && names.length > 0) await this.deps.rmdir(cache).catch(() => {})
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

  /** Undo an add: the records and the app's files for them go. The PSD stays where it was. */
  async undoAdd(mockupIds: number[]): Promise<void> {
    const added = mockupIds.filter((id) => {
      const m = this.repo.mockups.getMockup(id)
      return m !== undefined && m.stage === 'to_sort' && m.deletedAt === null
    })
    const removed = this.repo.trash.deleteMockupsHard(added)
    await this.removeAppFiles(removed, { keepPsd: true })
  }

  /** Remove the records of mockups whose PSD is gone. Anything else in `ids` is skipped. */
  async remove(ids: string[]): Promise<{ removed: number; mockupIds: number[] }> {
    const { gone } = await this.drift()
    const mockupIds = [...new Set(ids)].flatMap((id) => {
      const row = gone.get(id)
      return row ? [row.mockupId] : []
    })
    // Hard delete reports only the paths it freed, so the ids that really go are read first.
    const existing = mockupIds.filter((id) => this.repo.mockups.getMockup(id) !== undefined)
    const rows = this.repo.trash.deleteMockupsHard(existing)
    await this.removeAppFiles(rows)
    return { removed: rows.length, mockupIds: existing }
  }

  async removeAll(): Promise<{ removed: number; mockupIds: number[] }> {
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
    if (this.repo.mockups.getAllLibraryPaths().some((p) => p.libraryPath === picked)) {
      return { outcome: 'already-in-stash' }
    }

    let target = picked
    try {
      if (!isInside(this.mockupsDir(), picked)) {
        target = join(this.mockupsDir(), randomUUID(), 'original.psd')
        await this.deps.copyInto(picked, target)
      }
      const { size } = await this.deps.stat(target)
      this.repo.mockups.updateMockup(row.mockupId, { libraryPath: target, sizeBytes: size })
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

  /** The app's files for deleted records (removeAppCopies). Leaving one behind is better than failing the action. */
  private async removeAppFiles(
    rows: { id: number; libraryPath: string; coverPath: string }[],
    opts: { keepPsd?: boolean } = {}
  ): Promise<void> {
    await removeAppCopies(this.repo, this.libraryRoot, rows, this.deps, opts).catch(() => {})
  }

  /** Hard-delete a dangling DB row whose file is gone. No file to touch. */
  deleteOrphanRecord(mockupId: number): void {
    this.repo.mockups.deleteMockup(mockupId)
    this.repo.search.removeSearchIndex(mockupId)
  }

  /**
   * Register an in-place orphan file as a new To sort mockup WITHOUT copying it
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

    const mockup = this.repo.mockups.createMockup({
      title: basename(filePath, extname(filePath)),
      libraryPath: filePath,
      coverPath,
      coverSource,
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
