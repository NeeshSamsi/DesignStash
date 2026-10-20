import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { CopyFile, CopyPauseReason, CopyProgress, CopyStatus } from '@shared/ipc/import'
import type { Repository } from '../db/repository'
import type { CopyJob } from '../db/schema'
import { removeAppCopies } from '../library/app-files'
import { resolveCover } from '../psd'
import type { CoverResolution, ResolveCoverInput } from '../psd/types'
import { scanForPsds } from './scanner'
import { copyWithHash } from './stream-copy'

export interface CopyQueueDeps {
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
  freeBytes: (path: string) => Promise<number>
  /** Copy a file by streaming it, telling `onBytes` how much is written, and return its SHA-256. */
  copyHashed: (
    src: string,
    dest: string,
    onBytes: (written: number) => void
  ) => Promise<{ sha256: string; bytes: number }>
  stat: (path: string) => Promise<{ size: number }>
  rm: (path: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  /** Room kept free beyond the file itself, for its cover and thumbnail. */
  reserveBytes: number
  newId: () => string
  now: () => number
}

const defaultDeps: CopyQueueDeps = {
  resolveCover,
  freeBytes: async (p) => {
    const s = await fs.statfs(p)
    return s.bavail * s.bsize
  },
  copyHashed: copyWithHash,
  stat: (p) => fs.stat(p),
  rm: (p) => fs.rm(p, { force: true, recursive: true }),
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
  private lastPush = 0
  private rate: { haulId: string; samples: { at: number; bytes: number }[] } = { haulId: '', samples: [] }

  constructor(private readonly opts: CopyQueueOptions) {
    this.repo = opts.repo
    this.root = opts.libraryRoot
    this.deps = { ...defaultDeps, ...opts.deps }
  }

  /** Queue the PSDs under these paths. Joins the haul that is running or paused, else starts a new one. */
  async start(paths: string[]): Promise<CopyStatus> {
    const scan = scanForPsds(paths)
    const psds = [...scan.psds].sort((a, b) => a.psdPath.localeCompare(b.psdPath))

    // Read every size first. Nothing below awaits, so the haul that gets joined is still going when the jobs land in it.
    const jobs = await Promise.all(
      psds.map(async (p) => ({
        sourcePath: p.psdPath,
        fileName: basename(p.psdPath),
        folderTrail: p.importContext.folderTrail,
        // Read now so progress can be counted in bytes. A file that can't be read counts as nothing.
        sizeBytes: await this.deps.stat(p.psdPath).then((st) => st.size, () => 0)
      }))
    )

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

    if (this.repo.copyJobs.getJobs(haulId).length === 0) {
      this.repo.copyJobs.setHaulState(haulId, { state: 'done' })
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
      this.emit(haulId, null)
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
    await this.idle()

    const { ids } = this.repo.collectTossable(this.repo.copyJobs.landedMockupIds(haulId))
    const removed = this.repo.deleteMockupsHard(ids)
    await removeAppCopies(this.root, removed, this.deps.rm)
    this.repo.copyJobs.setHaulState(haulId, { state: 'undone' })
    this.emit(haulId, null)
    return { tossedIds: ids }
  }

  /** At launch: carry on a haul that was running. A paused one waits for Retry. */
  async resume(): Promise<void> {
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
        return
      }
      try {
        await this.handle(haul.id, job, haul.candidateImages)
      } catch (err) {
        if (err instanceof Pause) {
          this.repo.copyJobs.setJobState(job.id, { status: 'queued' })
          // A cancel that arrived meanwhile wins.
          if (this.repo.copyJobs.getHaul(haul.id)?.state === 'running') {
            this.repo.copyJobs.setHaulState(haul.id, { state: 'paused', pauseReason: err.reason })
          }
          this.emit(haul.id, null)
          return
        }
        console.error('[Copy] Queue error:', err)
        this.repo.copyJobs.setJobState(job.id, { status: 'skipped', skipReason: 'unreadable' })
        this.emit(haul.id, job.id)
      }
    }
  }

  private async handle(haulId: string, job: CopyJob, candidateImagePaths: string[]): Promise<void> {
    this.repo.copyJobs.setJobState(job.id, { status: 'copying' })
    this.emit(haulId, job.id)

    const skip = (reason: 'duplicate' | 'unreadable') => {
      this.repo.copyJobs.setJobState(job.id, { status: 'skipped', skipReason: reason })
      this.emit(haulId, job.id)
    }

    let size: number
    try {
      size = (await this.deps.stat(job.sourcePath)).size
    } catch (err) {
      if (codeOf(err) === 'ENOENT' || codeOf(err) === 'ENOTDIR') throw new Pause('source-gone')
      return skip('unreadable')
    }

    if ((await this.deps.freeBytes(this.root)) < size + this.deps.reserveBytes) throw new Pause('disk-full')

    const destDir = join(this.root, 'mockups', this.deps.newId())
    try {
      await this.deps.mkdir(destDir)
      const libraryPath = join(destDir, 'original.psd')
      // One pass over the original: it is copied and hashed together, and every chunk moves the bar.
      const { sha256 } = await this.deps.copyHashed(job.sourcePath, libraryPath, (written) => {
        this.live = { jobId: job.id, bytes: written }
        this.emitThrottled(haulId, job.id)
      })
      this.live = null

      if (this.repo.mockupExistsByHash(sha256)) {
        await this.deps.rm(destDir).catch(() => {})
        return skip('duplicate')
      }

      const cover = await this.deps.resolveCover({
        psdPath: job.sourcePath,
        candidateImagePaths,
        outDir: destDir
      })

      const mockup = this.repo.createMockup({
        title: basename(job.fileName, extname(job.fileName)),
        libraryPath,
        coverPath: cover.source === 'none' ? '' : cover.coverPath,
        coverSource: cover.source,
        contentHash: sha256,
        importContext: { batchId: haulId, folderTrail: job.folderTrail, originalFilename: job.fileName },
        reviewStatus: 'needs_review',
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
      if (codeOf(err) === 'ENOENT' && !(await this.sourceStillThere(job.sourcePath))) throw new Pause('source-gone')
      skip('unreadable')
    }
  }

  private async sourceStillThere(path: string): Promise<boolean> {
    return this.deps.stat(path).then(() => true, () => false)
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
      state: haul.state,
      pauseReason: haul.pauseReason ?? null,
      total: jobs.length,
      landed: jobs.filter((j) => j.mockupId !== null).length,
      bytesTotal,
      bytesCopied,
      bytesPerSecond: rate.bytesPerSecond,
      secondsLeft: rate.secondsLeft,
      skipped: {
        notPsd: haul.notPsdCount,
        duplicate: jobs.filter((j) => j.skipReason === 'duplicate').length,
        unreadable: jobs.filter((j) => j.skipReason === 'unreadable').length
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
    return { bytesPerSecond, secondsLeft: Math.max(0, Math.ceil((bytesTotal - bytesCopied) / bytesPerSecond)) }
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

function toFile(j: CopyJob, live: { jobId: number; bytes: number } | null): CopyFile {
  return {
    jobId: j.id,
    name: j.fileName,
    status: j.status,
    ...(j.skipReason ? { skipReason: j.skipReason } : {}),
    ...(j.mockupId !== null ? { mockupId: j.mockupId } : {}),
    size: j.sizeBytes,
    bytesCopied:
      j.status === 'done' ? j.sizeBytes : live?.jobId === j.id ? Math.min(live.bytes, j.sizeBytes) : 0
  }
}
