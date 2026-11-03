import { createWriteStream, promises as fs } from 'node:fs'
import { once } from 'node:events'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { Writable } from 'node:stream'
import type { ModelFile } from './registry'
import { MEANING_MODEL, MODEL_FILE_NAMES, getModel, isMeaningModel } from './registry'

/** The files a download for this id fetches, in order, or null when the id has nothing to download. */
function downloadFilesOf(id: string): { fileName: string; file: ModelFile }[] | null {
  if (isMeaningModel(id)) return [{ fileName: MODEL_FILE_NAMES.model, file: MEANING_MODEL.file }]
  const files = getModel(id)?.files
  if (!files) return null
  return [
    { fileName: MODEL_FILE_NAMES.model, file: files.model },
    { fileName: MODEL_FILE_NAMES.mmproj, file: files.mmproj }
  ]
}

/** Why a download stopped. These are the only reasons the screen ever shows. */
export type DownloadFailure = 'offline' | 'disk-full' | 'checksum' | 'server'

export class DownloadError extends Error {
  constructor(readonly reason: DownloadFailure) {
    super(`Download failed: ${reason}`)
    this.name = 'DownloadError'
  }
}

export interface DownloadProgress {
  modelId: string
  /** Both files together. */
  receivedBytes: number
  totalBytes: number
  phase: 'downloading' | 'verifying' | 'done'
  /** Recent speed. 0 until there is enough to measure. */
  bytesPerSecond: number
  /** null until the speed is known. */
  secondsLeft: number | null
}

export interface DownloaderOpts {
  fetchImpl?: typeof fetch
  /** Free bytes on the volume holding `path`. */
  freeBytes?: (path: string) => Promise<number>
  now?: () => number
  /** Where a download's bytes go. A file on disk by default; tests hand in a slow one. */
  createWriteStream?: (path: string, flags: string) => Writable
  /** Rename a folder. Tests make it fail the way it does across disks. */
  rename?: (from: string, to: string) => Promise<void>
}

/** Speed is measured over this many milliseconds, so it settles instead of jumping. */
const SPEED_WINDOW_MS = 5000
/** Room kept free beyond the download itself. */
const DISK_MARGIN_BYTES = 256 * 1024 * 1024

const NETWORK_CODES = new Set([
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH', 'UND_ERR_SOCKET'
])

/** Turn whatever went wrong into one of the four reasons. A cancel is passed through untouched. */
export function classifyDownloadError(err: unknown): Error {
  if (err instanceof DownloadError) return err
  if ((err as { name?: string } | null)?.name === 'AbortError') return err as Error
  const codes: string[] = []
  for (let e: unknown = err; e instanceof Error && codes.length < 4; e = e.cause) {
    codes.push((e as NodeJS.ErrnoException).code ?? '')
  }
  if (codes.includes('ENOSPC')) return new DownloadError('disk-full')
  if (codes.some((c) => NETWORK_CODES.has(c))) return new DownloadError('offline')
  // fetch reports an unreachable network as a bare TypeError.
  if (err instanceof TypeError && /fetch failed|network|Failed to fetch/i.test(err.message)) {
    return new DownloadError('offline')
  }
  return new DownloadError('server')
}

const ASIDE_SUFFIX = '.deleted'
/** A model being copied in from another disk. It only becomes the model's folder once it is whole. */
const MOVING_SUFFIX = '.moving'

/** A model id is a folder name: letters, digits, dots, dashes and underscores, never a path. */
export function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.includes('..')) throw new Error('Not a model id')
}

async function folderSize(dir: string): Promise<number> {
  let sum = 0
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, e.name)
    sum += e.isDirectory() ? await folderSize(path) : (await fs.stat(path).catch(() => ({ size: 0 }))).size
  }
  return sum
}

export class ModelDownloader {
  /** Settles once `adopt` has moved models in. Reads and downloads wait for it. */
  private moving: Promise<void> = Promise.resolve()

  constructor(
    private modelsDir: string,
    private opts?: DownloaderOpts
  ) {}

  /**
   * Earlier versions kept models beside the stash folder. Move each catalogue model found in `dir`
   * into this folder, unless it is already here. Anything else in `dir` stays where it is, and `dir`
   * itself goes only when moving the models out leaves it empty.
   */
  adopt(dir: string): Promise<void> {
    this.moving = this.moving.then(() => this.moveIn(dir)).catch(() => {})
    return this.moving
  }

  private async moveIn(dir: string): Promise<void> {
    if (resolve(dir) === resolve(this.modelsDir)) return
    let moved = 0
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !(getModel(entry.name) || isMeaningModel(entry.name))) continue
      const target = this.modelPath(entry.name)
      if (await fs.stat(target).then(() => true, () => false)) continue
      await fs.mkdir(this.modelsDir, { recursive: true })
      await this.moveFolder(join(dir, entry.name), target).then(() => moved++, () => {})
    }
    if (moved > 0) await fs.rmdir(dir).catch(() => {})
  }

  /** A rename on the same disk. From another disk, a whole copy first, then the original goes. */
  private async moveFolder(from: string, to: string): Promise<void> {
    const rename = this.opts?.rename ?? fs.rename
    try {
      await rename(from, to)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    }
    const copy = `${to}${MOVING_SUFFIX}`
    await fs.rm(copy, { recursive: true, force: true })
    try {
      await fs.cp(from, copy, { recursive: true })
      await rename(copy, to)
    } catch (err) {
      await fs.rm(copy, { recursive: true, force: true })
      throw err
    }
    await fs.rm(from, { recursive: true, force: true })
  }

  private get fetch() {
    return this.opts?.fetchImpl ?? fetch
  }

  private get now() {
    return this.opts?.now ?? Date.now
  }

  private async freeBytes(path: string): Promise<number> {
    if (this.opts?.freeBytes) return this.opts.freeBytes(path)
    const s = await fs.statfs(path)
    return s.bavail * s.bsize
  }

  private modelPath(id: string): string {
    return join(this.modelsDir, id)
  }

  private async verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    const hash = createHash('sha256')
    const file = await fs.open(filePath, 'r')
    try {
      for await (const chunk of file.createReadStream()) hash.update(chunk as Buffer)
    } finally {
      await file.close()
    }
    return hash.digest('hex') === expectedSha256
  }

  private async sizeOf(path: string): Promise<number> {
    return fs.stat(path).then((s) => s.size, () => 0)
  }

  /** Bytes already on disk for a model, finished or partial. A stopped download resumes from here. */
  async downloadedBytes(id: string): Promise<number> {
    await this.moving
    let sum = 0
    for (const { fileName } of downloadFilesOf(id) ?? []) {
      const final = await this.sizeOf(join(this.modelPath(id), fileName))
      sum += final > 0 ? final : await this.sizeOf(join(this.modelPath(id), `${fileName}.part`))
    }
    return sum
  }

  private async downloadFile(
    url: string,
    destPath: string,
    expectedSize: number,
    opts: { onProgress: (received: number) => void; signal?: AbortSignal }
  ): Promise<void> {
    let receivedBytes = await this.sizeOf(destPath)
    // A part file longer than the file can't be right.
    if (receivedBytes > expectedSize) {
      await fs.rm(destPath, { force: true })
      receivedBytes = 0
    }
    opts.onProgress(receivedBytes)
    // Already complete, only left to verify.
    if (receivedBytes === expectedSize) return

    const headers = new Headers()
    if (receivedBytes > 0) headers.append('Range', `bytes=${receivedBytes}-`)

    let response: Response
    try {
      response = await this.fetch(url, { headers, signal: opts.signal ?? null })
    } catch (err) {
      throw classifyDownloadError(err)
    }

    if (!response.ok && response.status !== 206) throw new DownloadError('server')
    if (!response.body) throw new DownloadError('server')

    // The server ignored the Range request and is sending the whole file: start over.
    let flags = 'a'
    if (receivedBytes > 0 && response.status === 200) {
      receivedBytes = 0
      flags = 'w'
    }

    const writeStream =
      this.opts?.createWriteStream?.(destPath, flags) ?? createWriteStream(destPath, { flags })
    let writeError: unknown = null
    writeStream.on('error', (e) => (writeError = e))
    const reader = response.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (opts.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
        if (writeError) throw writeError
        // A disk slower than the network: wait for it, so the rest of the file never piles up in memory.
        if (!writeStream.write(value)) {
          await once(writeStream, 'drain', opts.signal ? { signal: opts.signal } : {})
        }
        receivedBytes += value.length
        opts.onProgress(receivedBytes)
      }
      if (writeError) throw writeError
    } catch (err) {
      throw classifyDownloadError(err)
    } finally {
      writeStream.end()
      await new Promise((resolve) => writeStream.on('close', resolve))
      reader.releaseLock()
    }
    if (receivedBytes < expectedSize) throw new DownloadError('server')
  }

  /**
   * Installed means every file is there: a vision model's GGUF and its image projector, or the
   * meaning-search model's one GGUF. A built-in model has none.
   */
  async isInstalled(id: string): Promise<boolean> {
    await this.moving
    const files = downloadFilesOf(id)
    if (!files) return false
    try {
      for (const { fileName } of files) await fs.stat(join(this.modelPath(id), fileName))
      return true
    } catch {
      return false
    }
  }

  async listInstalled(): Promise<string[]> {
    await this.moving
    const installed: string[] = []
    try {
      const dirs = await fs.readdir(this.modelsDir, { withFileTypes: true })
      for (const dir of dirs) {
        // Vision models only; the meaning-search model is reported by `isInstalled` on its own.
        if (dir.isDirectory() && !isMeaningModel(dir.name) && (await this.isInstalled(dir.name))) {
          installed.push(dir.name)
        }
      }
    } catch {
      // models dir may not exist
    }
    return installed
  }

  async deleteModel(id: string): Promise<void> {
    await fs.rm(this.modelPath(id), { recursive: true, force: true })
  }

  /**
   * Delete a model in a way Undo can reverse: the folder is set aside, not removed. It's gone for
   * good when `purgeSetAside` runs (at the next launch). Returns false when there was nothing to delete.
   */
  async setAside(id: string): Promise<boolean> {
    assertSafeId(id)
    if (!(await fs.stat(this.modelPath(id)).then(() => true, () => false))) return false
    await fs.rm(this.asidePath(id), { recursive: true, force: true })
    await fs.rename(this.modelPath(id), this.asidePath(id))
    return true
  }

  /** Undo a delete. Returns false when the set-aside copy is gone. */
  async restoreSetAside(id: string): Promise<boolean> {
    assertSafeId(id)
    if (!(await fs.stat(this.asidePath(id)).then(() => true, () => false))) return false
    await fs.rm(this.modelPath(id), { recursive: true, force: true })
    await fs.rename(this.asidePath(id), this.modelPath(id))
    return true
  }

  /** Remove every set-aside model for good. */
  async purgeSetAside(): Promise<void> {
    for (const name of await this.folderNames()) {
      if (name.endsWith(ASIDE_SUFFIX)) await fs.rm(join(this.modelsDir, name), { recursive: true, force: true })
    }
  }

  /** Folders left by earlier versions (the old text models): not in the catalogue, ignored, and deletable. */
  async listLegacy(): Promise<{ id: string; sizeBytes: number }[]> {
    await this.moving
    const out: { id: string; sizeBytes: number }[] = []
    for (const name of await this.folderNames()) {
      if (name.endsWith(ASIDE_SUFFIX) || name.endsWith(MOVING_SUFFIX)) continue
      if (getModel(name) || isMeaningModel(name)) continue
      out.push({ id: name, sizeBytes: await folderSize(join(this.modelsDir, name)) })
    }
    return out
  }

  private asidePath(id: string): string {
    return join(this.modelsDir, `${id}${ASIDE_SUFFIX}`)
  }

  private async folderNames(): Promise<string[]> {
    try {
      return (await fs.readdir(this.modelsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      return []
    }
  }

  async download(
    id: string,
    opts: { onProgress?: (p: DownloadProgress) => void; signal?: AbortSignal } = {}
  ): Promise<void> {
    const model = getModel(id)
    if (!model && !isMeaningModel(id)) throw new Error(`Model not found: ${id}`)
    const listed = downloadFilesOf(id)
    if (!listed) throw new Error(`${model?.name ?? id} is built into macOS; there is nothing to download`)
    await this.moving

    const modelDir = this.modelPath(id)
    await fs.mkdir(modelDir, { recursive: true })

    const files = listed.map(({ fileName, file }) => ({ ...file, fileName }))
    const total = files.reduce((sum, f) => sum + f.sizeBytes, 0)

    // Enough room for what is still to come, before asking the network for anything.
    const remaining = Math.max(0, total - (await this.downloadedBytes(id)))
    if (remaining > 0 && (await this.freeBytes(modelDir)) < remaining + DISK_MARGIN_BYTES) {
      throw new DownloadError('disk-full')
    }

    const samples: { at: number; bytes: number }[] = []
    const measure = (received: number): { bytesPerSecond: number; secondsLeft: number | null } => {
      const at = this.now()
      samples.push({ at, bytes: received })
      while (samples.length > 2 && at - samples[0]!.at > SPEED_WINDOW_MS) samples.shift()
      const first = samples[0]!
      const elapsed = (at - first.at) / 1000
      const gained = received - first.bytes
      if (elapsed <= 0 || gained <= 0) return { bytesPerSecond: 0, secondsLeft: null }
      const bytesPerSecond = gained / elapsed
      return { bytesPerSecond, secondsLeft: Math.ceil((total - received) / bytesPerSecond) }
    }

    const report = (received: number, phase: DownloadProgress['phase']) =>
      opts.onProgress?.({
        modelId: id,
        receivedBytes: received,
        totalBytes: total,
        phase,
        ...(phase === 'done' ? { bytesPerSecond: 0, secondsLeft: 0 } : measure(received))
      })

    let doneBytes = 0
    for (const file of files) {
      const partPath = join(modelDir, `${file.fileName}.part`)
      const finalPath = join(modelDir, file.fileName)

      // A finished file from an earlier try is kept.
      if (await fs.stat(finalPath).then(() => true, () => false)) {
        doneBytes += file.sizeBytes
        continue
      }

      const downloadOpts: Parameters<typeof this.downloadFile>[3] = {
        onProgress: (received) => report(doneBytes + received, 'downloading')
      }
      if (opts.signal) downloadOpts.signal = opts.signal

      await this.downloadFile(file.url, partPath, file.sizeBytes, downloadOpts)

      if (file.sha256) {
        report(doneBytes + file.sizeBytes, 'verifying')
        if (!(await this.verifyChecksum(partPath, file.sha256))) {
          await fs.unlink(partPath)
          throw new DownloadError('checksum')
        }
      }

      await fs.rename(partPath, finalPath)
      doneBytes += file.sizeBytes
    }

    report(total, 'done')
  }
}
