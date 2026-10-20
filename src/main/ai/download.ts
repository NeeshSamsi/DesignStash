import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { getModel, MODEL_FILE_NAMES } from './registry'

export interface DownloadProgress {
  modelId: string
  receivedBytes: number
  totalBytes: number
  phase: 'downloading' | 'verifying' | 'done'
}

export class ModelDownloader {
  constructor(
    private modelsDir: string,
    private opts?: { fetchImpl?: typeof fetch }
  ) {}

  private get fetch() {
    return this.opts?.fetchImpl ?? fetch
  }

  private modelPath(id: string): string {
    return join(this.modelsDir, id)
  }

  private async verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    const fileBuffer = await fs.readFile(filePath)
    const hash = createHash('sha256').update(fileBuffer).digest('hex')
    return hash === expectedSha256
  }

  private async downloadFile(
    url: string,
    destPath: string,
    expectedSize: number,
    opts: {
      onProgress: (received: number, total: number) => void
      signal?: AbortSignal
    }
  ): Promise<void> {
    let receivedBytes = 0
    const headers = new Headers()

    try {
      const stat = await fs.stat(destPath)
      if (stat.size > 0) {
        receivedBytes = stat.size
        headers.append('Range', `bytes=${receivedBytes}-`)
      }
    } catch {
      // file doesn't exist, proceed
    }

    const response = await this.fetch(url, { headers, signal: opts.signal ?? null })

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to download: ${response.statusText}`)
    }
    if (!response.body) {
      throw new Error('Response has no body')
    }

    // Use the server's actual Content-Length so progress is always accurate.
    // For range requests the header reflects remaining bytes; add the partial we already have.
    const contentLength = response.headers.get('content-length')
    const totalBytes = contentLength ? Number(contentLength) + receivedBytes : expectedSize
    opts.onProgress(receivedBytes, totalBytes)

    const writeStream = createWriteStream(destPath, { flags: 'a' })
    const reader = response.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (opts.signal?.aborted) {
          throw new DOMException('This operation was aborted', 'AbortError')
        }
        writeStream.write(value)
        receivedBytes += value.length
        opts.onProgress(receivedBytes, totalBytes)
      }
    } finally {
      writeStream.end()
      await new Promise((resolve) => writeStream.on('finish', resolve))
      reader.releaseLock()
    }
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
        if (dir.isDirectory() && (await this.isInstalled(dir.name))) {
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
    let doneBytes = 0

    const report = (received: number, phase: DownloadProgress['phase']) =>
      opts.onProgress?.({ modelId: id, receivedBytes: received, totalBytes: total, phase })

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
          throw new Error(`Checksum failed for ${file.fileName}`)
        }
      }

      await fs.rename(partPath, finalPath)
      doneBytes += file.sizeBytes
    }

    report(total, 'done')
  }
}
