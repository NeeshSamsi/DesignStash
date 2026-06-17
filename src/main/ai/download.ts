import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { getModel } from './registry'

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

  async isInstalled(id: string): Promise<boolean> {
    const model = getModel(id)
    if (!model) return false

    try {
      await fs.stat(join(this.modelPath(id), model.url.split('/').pop()!))
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
    if (!model.url) {
      throw new Error(`Model "${id}" has no download URL configured`)
    }

    const modelDir = this.modelPath(id)
    await fs.mkdir(modelDir, { recursive: true })

    const filesToDownload: { url: string; sha256: string | null; size: number }[] = []
    filesToDownload.push({ url: model.url, sha256: model.sha256, size: model.sizeBytes })

    let totalReceived = 0
    // Seeded from registry; updated to the server's actual Content-Length on first progress tick.
    let knownTotal = model.sizeBytes

    const onProgress = (received: number, total: number) => {
      totalReceived = received
      knownTotal = total
      opts.onProgress?.({
        modelId: id,
        receivedBytes: totalReceived,
        totalBytes: knownTotal,
        phase: 'downloading'
      })
    }

    for (const file of filesToDownload) {
      const fileName = file.url.split('/').pop()!
      const partPath = join(modelDir, `${fileName}.part`)
      const finalPath = join(modelDir, fileName)

      const downloadOpts: Parameters<typeof this.downloadFile>[3] = {
        onProgress
      }
      if (opts.signal) {
        downloadOpts.signal = opts.signal
      }

      await this.downloadFile(file.url, partPath, file.size, downloadOpts)

      if (file.sha256) {
        opts.onProgress?.({
          modelId: id,
          receivedBytes: totalReceived,
          totalBytes: knownTotal,
          phase: 'verifying'
        })
        const checksumOk = await this.verifyChecksum(partPath, file.sha256)
        if (!checksumOk) {
          await fs.unlink(partPath)
          throw new Error(`Checksum failed for ${fileName}`)
        }
      } else {
        console.warn(`[ModelDownloader] Skipping integrity check for "${fileName}" — no sha256 in registry`)
      }

      await fs.rename(partPath, finalPath)
    }

    opts.onProgress?.({
      modelId: id,
      receivedBytes: knownTotal,
      totalBytes: knownTotal,
      phase: 'done'
    })
  }
}
