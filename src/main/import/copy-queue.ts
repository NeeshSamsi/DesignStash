import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { CopyFile, CopyPauseReason, CopyProgress, CopyStatus } from '@shared/ipc/import'
import type { Repository } from '../db/repository'
import type { CopyJob } from '../db/schema'
import { removeAppCopies } from '../library/app-files'
import { resolveCover } from '../psd'
import type { CoverResolution, ResolveCoverInput } from '../psd/types'
import { scanForPsds } from './scanner'

export interface CopyQueueDeps {
  resolveCover: (input: ResolveCoverInput) => Promise<CoverResolution>
  freeBytes: (path: string) => Promise<number>
  copyFile: (src: string, dest: string) => Promise<void>
  hashFile: (path: string) => Promise<string>
  stat: (path: string) => Promise<{ size: number }>
  rm: (path: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  /** Room kept free beyond the file itself, for its cover and thumbnail. */
  reserveBytes: number
  newId: () => string
}

const defaultDeps: CopyQueueDeps = {
  resolveCover,
  freeBytes: async (p) => {
    const s = await fs.statfs(p)
    return s.bavail * s.bsize
  },
  copyFile: (src, dest) => fs.copyFile(src, dest),
  hashFile: async (path) => {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
    return hash.digest('hex')
  },
  stat: (p) => fs.stat(p),
  rm: (p) => fs.rm(p, { force: true, recursive: true }),
  mkdir: async (p) => {
    await fs.mkdir(p, { recursive: true })
  },
  reserveBytes: 64 * 1024 * 1024,
  newId: randomUUID
}

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

  constructor(private readonly opts: CopyQueueOptions) {
    this.repo = opts.repo
    this.root = opts.libraryRoot
    this.deps = { ...defaultDeps, ...opts.deps }
  }

  /** Queue the PSDs under these paths. Joins the haul that is running or paused, else starts a new one. */
  async start(paths: string[]): Promise<CopyStatus> {
    const scan = scanForPsds(paths)
    const psds = [...scan.psds].sort((a, b) => a.psdPath.localeCompare(b.psdPath))

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
    this.repo.copyJobs.addJobs(
      haulId,
      psds.map((p) => ({
        sourcePath: p.psdPath,
        fileName: basename(p.psdPath),
        folderTrail: p.importContext.folderTrail
      }))
    )

    if (this.repo.copyJobs.getJobs(haulId).length === 0) {
      this.repo.copyJobs.updateHaul(haulId, { state: 'done' })
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
      this.repo.copyJobs.updateHaul(haulId, { state: 'cancelled', pauseReason: null })
      this.emit(haulId, null)
    }
    return { landedIds: this.repo.copyJobs.landedMockupIds(haulId) }
  }

  /** Carry on a paused haul from the file it stopped at. */
  async retry(haulId: string): Promise<CopyStatus> {
    const haul = this.repo.copyJobs.getHaul(haulId)
    if (!haul) throw new Error('No such haul')
    if (haul.state === 'paused') {
      this.repo.copyJobs.updateHaul(haulId, { state: 'running', pauseReason: null })
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
    this.repo.copyJobs.updateHaul(haulId, { state: 'undone', pauseReason: null })
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
        this.repo.copyJobs.updateHaul(haul.id, { state: 'done' })
        this.emit(haul.id, null)
        return
      }
      try {
        await this.handle(haul.id, job, haul.candidateImages)
      } catch (err) {
        if (err instanceof Pause) {
          this.repo.copyJobs.updateJob(job.id, { status: 'queued' })
          // A cancel that arrived meanwhile wins.
          if (this.repo.copyJobs.getHaul(haul.id)?.state === 'running') {
            this.repo.copyJobs.updateHaul(haul.id, { state: 'paused', pauseReason: err.reason })
          }
          this.emit(haul.id, null)
          return
        }
        console.error('[Copy] Queue error:', err)
        this.repo.copyJobs.updateJob(job.id, { status: 'skipped', skipReason: 'unreadable', sourcePath: '' })
        this.emit(haul.id, job.id)
      }
    }
  }

  private async handle(haulId: string, job: CopyJob, candidateImagePaths: string[]): Promise<void> {
    this.repo.copyJobs.updateJob(job.id, { status: 'copying' })
    this.emit(haulId, job.id)

    const skip = (reason: 'duplicate' | 'unreadable') => {
      this.repo.copyJobs.updateJob(job.id, { status: 'skipped', skipReason: reason, sourcePath: '' })
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

    let hash: string
    try {
      hash = await this.deps.hashFile(job.sourcePath)
    } catch (err) {
      if (codeOf(err) === 'ENOENT') throw new Pause('source-gone')
      return skip('unreadable')
    }
    if (this.repo.mockupExistsByHash(hash)) return skip('duplicate')

    const destDir = join(this.root, 'mockups', this.deps.newId())
    try {
      await this.deps.mkdir(destDir)
      const cover = await this.deps.resolveCover({
        psdPath: job.sourcePath,
        candidateImagePaths,
        outDir: destDir
      })
      const libraryPath = join(destDir, 'original.psd')
      await this.deps.copyFile(job.sourcePath, libraryPath)

      const mockup = this.repo.createMockup({
        title: basename(job.fileName, extname(job.fileName)),
        libraryPath,
        coverPath: cover.source === 'none' ? '' : cover.coverPath,
        coverSource: cover.source,
        contentHash: hash,
        importContext: { batchId: haulId, folderTrail: job.folderTrail, originalFilename: job.fileName },
        reviewStatus: 'needs_review',
        stage: 'to_sort',
        sizeBytes: size
      })
      this.repo.copyJobs.updateJob(job.id, { status: 'done', mockupId: mockup.id, sourcePath: '' })
      this.emit(haulId, job.id)
      this.opts.onLanded?.([mockup.id])
    } catch (err) {
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
    return {
      haulId,
      state: haul.state,
      pauseReason: haul.pauseReason ?? null,
      total: jobs.length,
      landed: jobs.filter((j) => j.mockupId !== null).length,
      skipped: {
        notPsd: haul.notPsdCount,
        duplicate: jobs.filter((j) => j.skipReason === 'duplicate').length,
        unreadable: jobs.filter((j) => j.skipReason === 'unreadable').length
      },
      files: jobs.map(toFile)
    }
  }

  private emit(haulId: string, changedJobId: number | null): void {
    const status = this.statusOf(haulId)
    if (!status) return
    const { files, ...counts } = status
    const job = changedJobId === null ? undefined : files.find((f) => f.jobId === changedJobId)
    this.opts.onProgress?.({ ...counts, file: job ?? null })
  }
}

function toFile(j: CopyJob): CopyFile {
  return {
    jobId: j.id,
    name: j.fileName,
    status: j.status,
    ...(j.skipReason ? { skipReason: j.skipReason } : {}),
    ...(j.mockupId !== null ? { mockupId: j.mockupId } : {})
  }
}
