import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join, sep } from 'node:path'
import type { Readable } from 'node:stream'
import type { CopyFile, CopyPauseReason, CopyProgress, CopyStatus } from '@shared/ipc/import'
import type { Repository } from '../db/repository'
import type { CopyJob } from '../db/schema'
import { removeAppCopies } from '../library/app-files'
import { SLOT_MASK_FILE, resolveCover, writeDesignSlotMask } from '../psd'
import type { CoverResolution, ResolveCoverInput } from '../psd/types'
import {
  entryPath,
  listArchive,
  openArchiveEntry,
  previewImages,
  type ArchiveEntry
} from './archive'
import { cleanArchiveName } from './archive-name'
import { scanForPsds } from './scanner'
import { copyWithHash, type CopySource } from './stream-copy'

export interface CopyQueueDeps {
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
  /**
   * Writes the PSD's design slot mask beside its cover (`writeDesignSlotMask`), so the AI never sees
   * the placeholder. Says whether it wrote one; a failure only means the AI sees the cover as it is.
   */
  writeSlotMask: (psdPath: string, coverPath: string, outPath: string) => Promise<boolean>
  freeBytes: (path: string) => Promise<number>
  /** Copy a file (or a stream of one) by streaming it, telling `onBytes` how much is written, and return its SHA-256. */
  copyHashed: (
    src: CopySource,
    dest: string,
    onBytes: (written: number) => void
  ) => Promise<{ sha256: string; bytes: number }>
  /** Stream one PSD (or a preview image) out of a zip. */
  openArchiveEntry: (zipPath: string, entryName: string) => Promise<Readable>
  /** Every entry in a zip, for the images that could be a PSD's preview. */
  listArchive: (zipPath: string) => Promise<ArchiveEntry[]>
  readFile: (path: string) => Promise<Buffer>
  stat: (path: string) => Promise<{ size: number }>
  /** The names in a folder; empty when it is not there. */
  readdir: (path: string) => Promise<string[]>
  rm: (path: string) => Promise<void>
  /** Remove a folder once it is empty; fails when it is not. */
  rmdir: (path: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  /** Room kept free beyond the file itself, for its cover and thumbnail. */
  reserveBytes: number
  newId: () => string
  now: () => number
}

const defaultDeps: CopyQueueDeps = {
  resolveCover,
  writeSlotMask: writeDesignSlotMask,
  freeBytes: async (p) => {
    const s = await fs.statfs(p)
    return s.bavail * s.bsize
  },
  copyHashed: copyWithHash,
  openArchiveEntry,
  listArchive,
  readFile: (p) => fs.readFile(p),
  stat: (p) => fs.stat(p),
  readdir: (p) => fs.readdir(p).catch(() => []),
  rm: (p) => fs.rm(p, { force: true, recursive: true }),
  rmdir: (p) => fs.rmdir(p),
  mkdir: async (p) => {
    await fs.mkdir(p, { recursive: true })
  },
  reserveBytes: 64 * 1024 * 1024,
  newId: randomUUID,
  now: Date.now
}

/** Byte progress is pushed at most this often, about ten times a second. */
const PUSH_INTERVAL_MS = 100
/** Speed is measured over this long, so the time left settles instead of jumping. */
const RATE_WINDOW_MS = 8000
/** No time left is shown until at least this much has been measured. */
const RATE_MIN_MS = 1500

export interface CopyQueueOptions {
  repo: Repository
  libraryRoot: string
  onProgress?: (progress: CopyProgress) => void
  /** Called with the mockups that just landed in To sort, so the AI queue can pick them up. */
  onLanded?: (ids: number[]) => void
  deps?: Partial<CopyQueueDeps>
}

/** A pause that is not an error: the haul waits for Retry. */
class Pause extends Error {
  constructor(readonly reason: CopyPauseReason) {
    super(reason)
  }
}

const codeOf = (err: unknown): string => (err as NodeJS.ErrnoException | null)?.code ?? ''

/**
 * Copies dropped PSDs into the stash one at a time. Every file is a saved job, so a restart carries on
 * from the file it had reached. Files dropped while it runs join the same haul. When the disk fills or
 * the source goes away it pauses with a reason and waits for Retry. Landed files wait in To sort, and
 * the originals are never changed or remembered once handled.
 */
export class CopyQueue {
  private readonly repo: Repository
  private readonly root: string
  private readonly deps: CopyQueueDeps
  private pumping: Promise<void> | null = null
  /** The file being copied and how much of it is written. */
  private live: { jobId: number; bytes: number } | null = null
  /** The file being handled and the haul it belongs to. */
  private inFlight: { haulId: string; settled: Promise<boolean> } | null = null
  private lastPush = 0
  /** Staging folders of drops still being read, which cleanup must leave alone. */
  private readonly scanning = new Set<string>()
  private rate: { haulId: string; samples: { at: number; bytes: number }[] } = {
    haulId: '',
    samples: []
  }

  constructor(private readonly opts: CopyQueueOptions) {
    this.repo = opts.repo
    this.root = opts.libraryRoot
    this.deps = { ...defaultDeps, ...opts.deps }
  }

  /** Queue the PSDs under these paths. Joins the haul that is running or paused, else starts a new one. */
  async start(paths: string[]): Promise<CopyStatus> {
    // A zip inside a dropped zip is copied out here to be read. Cleared once no haul needs it.
    const stagingDir = join(this.stagingRoot(), this.deps.newId())
    this.scanning.add(stagingDir)
    try {
      return await this.queue(paths, stagingDir)
    } finally {
      this.scanning.delete(stagingDir)
    }
  }

  private async queue(paths: string[], stagingDir: string): Promise<CopyStatus> {
    const scan = await scanForPsds(paths, { stagingDir })
    const psds = [...scan.psds].sort((a, b) => a.psdPath.localeCompare(b.psdPath))

    // Read every size first. Nothing below awaits, so the haul that gets joined is still going when the jobs land in it.
    const jobs = await Promise.all(
      psds.map(async (p) =>
        p.archive
          ? {
              sourcePath: p.archive.path,
              archiveEntry: p.archive.entry,
              archiveName: p.archive.name,
              fileName: p.importContext.originalFileName,
              folderTrail: p.importContext.folderTrail,
              // Uncompressed, so the disk check and progress count what is written.
              sizeBytes: p.archive.size
            }
          : {
              sourcePath: p.psdPath,
              fileName: basename(p.psdPath),
              folderTrail: p.importContext.folderTrail,
              // Read now so progress can be counted in bytes. A file that can't be read counts as nothing.
              sizeBytes: await this.deps.stat(p.psdPath).then(
                (st) => st.size,
                () => 0
              )
            }
      )
    )
    const skippedArchives = [...scan.skippedArchives]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((a) => ({ fileName: a.name, skipReason: a.reason }))

    const active = this.repo.copyJobs.getActiveHaul()
    let haulId: string
    if (active) {
      haulId = active.id
      this.repo.copyJobs.updateHaul(haulId, {
        notPsdCount: active.notPsdCount + scan.skippedCount,
        candidateImages: [...new Set([...active.candidateImages, ...scan.candidateImagePaths])]
      })
    } else {
      haulId = this.deps.newId()
      this.repo.copyJobs.createHaul(haulId, scan.candidateImagePaths, scan.skippedCount)
    }
    this.repo.copyJobs.addJobs(haulId, jobs)
    this.repo.copyJobs.addSkippedJobs(haulId, skippedArchives)

    if (!active && !this.repo.copyJobs.nextQueued(haulId)) {
      this.repo.copyJobs.setHaulState(haulId, { state: 'done' })
      void this.cleanStaging()
    }
    this.emit(haulId, null)
    // Start on the next turn, so a caller that gets the status back can still act before the first file.
    setImmediate(() => this.pump())
    return this.statusOf(haulId)!
  }

  /** The haul that is running or paused, else the latest, else null. */
  async status(): Promise<CopyStatus | null> {
    const haul = this.repo.copyJobs.getActiveHaul() ?? this.repo.copyJobs.getLatestHaul()
    return haul ? this.statusOf(haul.id) : null
  }

  /** Stop. The file being copied finishes; what has landed stays until Undo all. */
  async cancel(haulId: string): Promise<{ landedIds: number[] }> {
    const haul = this.repo.copyJobs.getHaul(haulId)
    if (!haul) return { landedIds: [] }
    if (haul.state === 'running' || haul.state === 'paused') {
      this.repo.copyJobs.setHaulState(haulId, { state: 'cancelled' })
      this.repo.copyJobs.forgetPendingSources(haulId)
      this.emit(haulId, null)
      // A file in flight may still be reading from staging; clear it once that is done.
      if (this.inFlight?.haulId === haulId)
        void this.inFlight.settled.then(() => this.cleanStaging())
      else await this.cleanStaging()
    }
    return { landedIds: this.repo.copyJobs.landedMockupIds(haulId) }
  }

  /** Carry on a paused haul from the file it stopped at. */
  async retry(haulId: string): Promise<CopyStatus> {
    const haul = this.repo.copyJobs.getHaul(haulId)
    if (!haul) throw new Error('No such haul')
    if (haul.state === 'paused') {
      this.repo.copyJobs.setHaulState(haulId, { state: 'running' })
      this.emit(haulId, null)
      this.pump()
    }
    return this.statusOf(haulId)!
  }

  /** Remove what the haul landed, as long as it is still waiting in an inbox. Originals are never touched. */
  async undoAll(haulId: string): Promise<{ tossedIds: number[] }> {
    const haul = this.repo.copyJobs.getHaul(haulId)
    if (!haul) return { tossedIds: [] }
    await this.cancel(haulId)
    // Only this haul's file in flight matters. Later hauls keep going while the undo finishes.
    if (this.inFlight?.haulId === haulId) await this.inFlight.settled

    const { ids } = this.repo.inbox.collectTossable(this.repo.copyJobs.landedMockupIds(haulId))
    const removed = this.repo.trash.deleteMockupsHard(ids)
    await removeAppCopies(this.repo, this.root, removed, this.deps)
    this.repo.copyJobs.setHaulState(haulId, { state: 'undone' })
    this.repo.copyJobs.forgetPendingSources(haulId)
    this.emit(haulId, null)
    return { tossedIds: ids }
  }

  /** At launch: carry on a haul that was running. A paused one waits for Retry. */
  async resume(): Promise<void> {
    await this.cleanStaging()
    const haul = this.repo.copyJobs.getActiveHaul()
    if (!haul) return
    this.repo.copyJobs.resetCopying(haul.id)
    if (haul.state === 'running') this.pump()
  }

  async idle(): Promise<void> {
    // The first turn lets a start() that is about to pump do so.
    await new Promise((r) => setImmediate(r))
    while (this.pumping) await this.pumping
  }

  // ---- the loop ----

  private pump(): void {
    if (this.pumping) return
    this.pumping = this.drain().finally(() => {
      this.pumping = null
    })
  }

  private async drain(): Promise<void> {
    for (;;) {
      const haul = this.repo.copyJobs.getActiveHaul()
      if (!haul || haul.state !== 'running') return
      const job = this.repo.copyJobs.nextQueued(haul.id)
      if (!job) {
        this.repo.copyJobs.setHaulState(haul.id, { state: 'done' })
        this.emit(haul.id, null)
        await this.cleanStaging()
        return
      }
      const attempt = this.attempt(haul.id, job, haul.candidateImages)
      this.inFlight = { haulId: haul.id, settled: attempt }
      try {
        if (!(await attempt)) return
      } finally {
        this.inFlight = null
      }
    }
  }

  /** Copy one file. False when the loop should stop, because the haul paused. */
  private async attempt(haulId: string, job: CopyJob, candidateImages: string[]): Promise<boolean> {
    try {
      await this.handle(haulId, job, candidateImages)
    } catch (err) {
      if (err instanceof Pause) {
        this.repo.copyJobs.setJobState(job.id, { status: 'queued' })
        // A cancel that arrived meanwhile wins.
        if (this.repo.copyJobs.getHaul(haulId)?.state === 'running') {
          this.repo.copyJobs.setHaulState(haulId, { state: 'paused', pauseReason: err.reason })
        }
        this.emit(haulId, null)
        return false
      }
      console.error('[Copy] Queue error:', err)
      this.repo.copyJobs.setJobState(job.id, { status: 'skipped', skipReason: 'unreadable' })
      this.emit(haulId, job.id)
    }
    return true
  }

  private async handle(haulId: string, job: CopyJob, candidateImagePaths: string[]): Promise<void> {
    this.repo.copyJobs.setJobState(job.id, { status: 'copying' })
    this.emit(haulId, job.id)

    const skip = (reason: 'duplicate' | 'unreadable') => {
      this.repo.copyJobs.setJobState(job.id, { status: 'skipped', skipReason: reason })
      this.emit(haulId, job.id)
    }

    // A PSD inside a zip: the zip has to be there, and the size is the PSD's own, read from the zip.
    const entry = job.archiveEntry
    let size: number
    try {
      const st = await this.deps.stat(job.sourcePath)
      size = entry === null ? st.size : job.sizeBytes
    } catch (err) {
      if (codeOf(err) === 'ENOENT' || codeOf(err) === 'ENOTDIR') throw new Pause('source-gone')
      return skip('unreadable')
    }

    if ((await this.deps.freeBytes(this.root)) < size + this.deps.reserveBytes)
      throw new Pause('disk-full')

    const destDir = join(this.root, 'mockups', this.deps.newId())
    try {
      await this.deps.mkdir(destDir)
      const libraryPath = join(destDir, 'original.psd')
      // One pass over the original: it is copied and hashed together, and every chunk moves the bar.
      const source: CopySource =
        entry === null ? job.sourcePath : () => this.deps.openArchiveEntry(job.sourcePath, entry)
      const { sha256 } = await this.deps.copyHashed(source, libraryPath, (written) => {
        this.live = { jobId: job.id, bytes: written }
        this.emitThrottled(haulId, job.id)
      })
      this.live = null

      if (this.repo.mockups.mockupExistsByHash(sha256)) {
        await this.deps.rm(destDir).catch(() => {})
        return skip('duplicate')
      }

      // The preview is read from the stash's copy; sidecars are matched against where the PSD came from.
      // A kit's preview image is often packed beside the PSD, so a zip's own images are offered too.
      const zipImages = entry === null ? new Map<string, string>() : await this.zipImages(job.sourcePath)
      const cover = await this.deps.resolveCover({
        psdPath: libraryPath,
        sidecarFor: entry === null ? job.sourcePath : entryPath(job.sourcePath, entry),
        candidateImagePaths: [...candidateImagePaths, ...zipImages.keys()],
        readImage: async (path) => {
          const name = zipImages.get(path)
          if (name === undefined) return this.deps.readFile(path)
          const stream = await this.deps.openArchiveEntry(job.sourcePath, name)
          return Buffer.concat(await stream.toArray())
        },
        outDir: destDir
      })

      if (cover.source !== 'none')
        await this.deps
          .writeSlotMask(libraryPath, cover.coverPath, join(destDir, SLOT_MASK_FILE))
          .catch(() => false)

      const mockup = this.repo.mockups.createMockup({
        // Names inside zips sometimes start with a space.
        title: basename(job.fileName, extname(job.fileName)).trim(),
        libraryPath,
        coverPath: cover.source === 'none' ? '' : cover.coverPath,
        coverSource: cover.source,
        contentHash: sha256,
        importContext: {
          batchId: haulId,
          folderTrail: job.folderTrail,
          originalFilename: job.fileName,
          // Which zip it came out of, so Sort suggests a zip's PSDs as one pile named after it.
          ...(job.archiveName !== null ? archiveContext(job.archiveName) : {})
        },
        stage: 'to_sort',
        sizeBytes: size
      })
      this.repo.copyJobs.setJobState(job.id, { status: 'done', mockupId: mockup.id })
      this.emit(haulId, job.id)
      this.opts.onLanded?.([mockup.id])
    } catch (err) {
      this.live = null
      await this.deps.rm(destDir).catch(() => {})
      if (codeOf(err) === 'ENOSPC') throw new Pause('disk-full')
      if (codeOf(err) === 'ENOENT' && !(await this.sourceStillThere(job.sourcePath)))
        throw new Pause('source-gone')
      skip('unreadable')
    }
  }

  /** The images in a zip that could be a PSD's preview (`previewImages`); none when it can't be listed. */
  private async zipImages(zipPath: string): Promise<Map<string, string>> {
    return previewImages(zipPath, await this.deps.listArchive(zipPath).catch((): ArchiveEntry[] => []))
  }

  private async sourceStillThere(path: string): Promise<boolean> {
    return this.deps.stat(path).then(
      () => true,
      () => false
    )
  }

  // ---- staging ----

  private stagingRoot(): string {
    return join(this.root, '.staging')
  }

  /**
   * Remove staged zips no haul still needs: anything not waiting in the running or paused haul and
   * not part of a drop still being read. Runs when a haul finishes and at launch.
   */
  async cleanStaging(): Promise<void> {
    const stagingRoot = this.stagingRoot()
    const keep = [...this.repo.copyJobs.pendingSourcePaths(), ...this.scanning]
    const names = await this.deps.readdir(stagingRoot)
    let left = 0
    for (const name of names) {
      const dir = join(stagingRoot, name)
      if (keep.some((p) => p === dir || p.startsWith(dir + sep))) left++
      else await this.deps.rm(dir).catch(() => left++)
    }
    if (left === 0) await this.deps.rm(stagingRoot).catch(() => {})
  }

  // ---- reporting ----

  private statusOf(haulId: string): CopyStatus | null {
    const haul = this.repo.copyJobs.getHaul(haulId)
    if (!haul) return null
    const jobs = this.repo.copyJobs.getJobs(haulId)
    const live = this.live
    const bytesTotal = jobs.reduce((sum, j) => sum + j.sizeBytes, 0)
    const bytesCopied = jobs.reduce(
      (sum, j) =>
        sum +
        (j.status === 'done' || j.status === 'skipped'
          ? j.sizeBytes
          : live?.jobId === j.id
            ? Math.min(live.bytes, j.sizeBytes)
            : 0),
      0
    )
    const rate = this.rateFor(haulId, haul.state === 'running', bytesCopied, bytesTotal)
    return {
      haulId,
      // A paused haul always has its reason (setHaulState writes them together).
      ...(haul.state === 'paused'
        ? { state: 'paused' as const, pauseReason: haul.pauseReason ?? 'disk-full' }
        : { state: haul.state }),
      total: jobs.length,
      landed: jobs.filter((j) => j.mockupId !== null).length,
      bytesTotal,
      bytesCopied,
      bytesPerSecond: rate.bytesPerSecond,
      secondsLeft: rate.secondsLeft,
      skipped: {
        notPsd: haul.notPsdCount,
        duplicate: jobs.filter((j) => j.skipReason === 'duplicate').length,
        unreadable: jobs.filter((j) => j.skipReason === 'unreadable').length,
        archiveUnsupported: jobs.filter((j) => j.skipReason === 'archive-unsupported').length,
        noPsdInArchive: jobs.filter((j) => j.skipReason === 'no-psd-in-archive').length
      },
      files: jobs.map((j) => toFile(j, live))
    }
  }

  /** Speed over the last few seconds, and the time left at that speed. Nothing until there is enough to go on. */
  private rateFor(
    haulId: string,
    running: boolean,
    bytesCopied: number,
    bytesTotal: number
  ): { bytesPerSecond: number; secondsLeft: number | null } {
    if (this.rate.haulId !== haulId) this.rate = { haulId, samples: [] }
    if (!running) {
      this.rate.samples = []
      return { bytesPerSecond: 0, secondsLeft: null }
    }
    const at = this.deps.now()
    const last = this.rate.samples.at(-1)
    // Several readings in the same instant add nothing; keep the latest.
    if (last && last.at === at) last.bytes = bytesCopied
    else this.rate.samples.push({ at, bytes: bytesCopied })
    while (this.rate.samples.length > 2 && at - this.rate.samples[0]!.at > RATE_WINDOW_MS) {
      this.rate.samples.shift()
    }
    const first = this.rate.samples[0]!
    const elapsed = at - first.at
    const gained = bytesCopied - first.bytes
    if (elapsed < RATE_MIN_MS || gained <= 0) return { bytesPerSecond: 0, secondsLeft: null }
    const bytesPerSecond = (gained / elapsed) * 1000
    return {
      bytesPerSecond,
      secondsLeft: Math.max(0, Math.ceil((bytesTotal - bytesCopied) / bytesPerSecond))
    }
  }

  private emit(haulId: string, changedJobId: number | null): void {
    const status = this.statusOf(haulId)
    if (!status) return
    this.lastPush = this.deps.now()
    const { files, ...counts } = status
    const job = changedJobId === null ? undefined : files.find((f) => f.jobId === changedJobId)
    this.opts.onProgress?.({ ...counts, file: job ?? null })
  }

  /** Byte progress while a file copies: pushed about ten times a second, never on every chunk. */
  private emitThrottled(haulId: string, changedJobId: number): void {
    if (this.deps.now() - this.lastPush < PUSH_INTERVAL_MS) return
    this.emit(haulId, changedJobId)
  }
}

function archiveContext(archiveName: string): { archiveName: string; archiveTitle?: string } {
  const archiveTitle = cleanArchiveName(archiveName)
  return archiveTitle ? { archiveName, archiveTitle } : { archiveName }
}

function toFile(j: CopyJob, live: { jobId: number; bytes: number } | null): CopyFile {
  return {
    jobId: j.id,
    name: j.fileName,
    ...(j.archiveName !== null ? { archiveName: j.archiveName } : {}),
    status: j.status,
    ...(j.skipReason ? { skipReason: j.skipReason } : {}),
    ...(j.mockupId !== null ? { mockupId: j.mockupId } : {}),
    size: j.sizeBytes,
    bytesCopied:
      j.status === 'done'
        ? j.sizeBytes
        : live?.jobId === j.id
          ? Math.min(live.bytes, j.sizeBytes)
          : 0
  }
}
