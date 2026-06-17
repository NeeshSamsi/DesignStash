import { basename, extname, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { resolveCover } from '../psd'
import type { Repository } from '../db/repository'
import { scanForPsds } from './scanner'

export interface ImportProgress {
  batchId: string
  phase: 'scanning' | 'copying' | 'done'
  completed: number
  total: number
  currentTitle?: string
}
export interface ImportItemResult {
  title: string
  status: 'imported' | 'pending_preview' | 'duplicate' | 'error'
  mockupId?: number
  coverSource?: 'embedded' | 'sidecar'
  detail?: string
}
export interface ImportSummary {
  batchId: string
  items: ImportItemResult[]
  imported: number
  pendingPreview: number
  duplicates: number
  errors: number
  skippedNonPsd: number
}

export class ImportService {
  // AI inference is intentionally NOT wired here — it runs as a post-grouping
  // stage (spec §3.2/§3.4), not inline at import. See src/shared/inference.ts.
  constructor(
    private readonly repo: Repository,
    private readonly libraryRoot: string
  ) {}

  async importPaths(
    droppedPaths: string[],
    opts: { onProgress?: (p: ImportProgress) => void; signal?: AbortSignal; batchId?: string }
  ): Promise<ImportSummary> {
    const batchId = opts.batchId ?? randomUUID()
    const onProgress = opts.onProgress ?? (() => {})

    onProgress({ batchId, phase: 'scanning', completed: 0, total: droppedPaths.length })
    const { psds, skippedCount, candidateImagePaths } = scanForPsds(droppedPaths)
    const total = psds.length

    onProgress({ batchId, phase: 'copying', completed: 0, total })

    const summary: ImportSummary = {
      batchId,
      items: [],
      imported: 0,
      pendingPreview: 0,
      duplicates: 0,
      errors: 0,
      skippedNonPsd: skippedCount
    }

    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) break
      const scannedPsd = psds[i]
      if (!scannedPsd) continue
      const title = basename(scannedPsd.psdPath, extname(scannedPsd.psdPath))
      onProgress({ batchId, phase: 'copying', completed: i, total, currentTitle: title })

      const destDir = join(this.libraryRoot, 'mockups', randomUUID())

      try {
        const hash = createHash('sha256').update(readFileSync(scannedPsd.psdPath)).digest('hex')
        if (this.repo.mockupExistsByHash(hash)) {
          summary.items.push({ title, status: 'duplicate' })
          summary.duplicates++
          continue
        }

        const cover = await resolveCover({
          psdPath: scannedPsd.psdPath,
          candidateImagePaths,
          outDir: destDir
        })

        if (cover.source === 'none') {
          summary.items.push({ title, status: 'pending_preview' })
          summary.pendingPreview++
          rmSync(destDir, { recursive: true, force: true })
          continue
        }

        mkdirSync(destDir, { recursive: true })
        const libraryPsdPath = join(destDir, 'original.psd')
        copyFileSync(scannedPsd.psdPath, libraryPsdPath)

        const mockup = this.repo.createMockup({
          title,
          libraryPath: libraryPsdPath,
          coverPath: cover.coverPath,
          coverSource: cover.source,
          contentHash: hash,
          importContext: scannedPsd.importContext,
          reviewStatus: 'needs_review'
        })

        summary.items.push({
          title,
          status: 'imported',
          mockupId: mockup.id,
          coverSource: cover.source
        })
        summary.imported++
      } catch (err) {
        summary.items.push({
          title,
          status: 'error',
          detail: err instanceof Error ? err.message : String(err)
        })
        summary.errors++
        rmSync(destDir, { recursive: true, force: true })
      }
    }
    onProgress({ batchId, phase: 'done', completed: total, total })
    return summary
  }
}
