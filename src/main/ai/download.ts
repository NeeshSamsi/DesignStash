import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { getModel, MODEL_FILE_NAMES } from './registry'

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

export class ModelDownloader {
  constructor(
    private modelsDir: string,
    private opts?: DownloaderOpts
  ) {}

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
    const model = getModel(id)
    if (!model) return 0
    let sum = 0
    for (const kind of ['model', 'mmproj'] as const) {
      const final = await this.sizeOf(join(this.modelPath(id), MODEL_FILE_NAMES[kind]))
      sum += final > 0 ? final : await this.sizeOf(join(this.modelPath(id), `${MODEL_FILE_NAMES[kind]}.part`))
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

    const writeStream = createWriteStream(destPath, { flags })
    let writeError: unknown = null
    writeStream.on('error', (e) => (writeError = e))
    const reader = response.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (opts.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError')
        if (writeError) throw writeError
        writeStream.write(value)
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

  /** Installed means both files are there: the model and its image projector. */
  async isInstalled(id: string): Promise<boolean> {
    if (!getModel(id)) return false
    try {
      await fs.stat(join(this.modelPath(id), MODEL_FILE_NAMES.model))
      await fs.stat(join(this.modelPath(id), MODEL_FILE_NAMES.mmproj))
      return true
    } catch {
      return false
    }
  }

  async listInstalled(): Promise<string[]> {
    const installed: string[] = []
    try {
      const dirs = await fs.readdir(this.modelsDir, { withFileTypes: true })
      for (const dir of dirs) {
        if (dir.isDirectory() && (await this.isInstalled(dir.name))) installed.push(dir.name)
      }
    } catch {
      // models dir may not exist
    }
    return installed
  }

  async deleteModel(id: string): Promise<void> {
    await fs.rm(this.modelPath(id), { recursive: true, force: true })
  }

  async download(
    id: string,
    opts: { onProgress?: (p: DownloadProgress) => void; signal?: AbortSignal } = {}
  ): Promise<void> {
    const model = getModel(id)
    if (!model) throw new Error(`Model not found: ${id}`)

    const modelDir = this.modelPath(id)
    await fs.mkdir(modelDir, { recursive: true })

    const files = (['model', 'mmproj'] as const).map((kind) => ({
      ...model.files[kind],
      fileName: MODEL_FILE_NAMES[kind]
    }))
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
