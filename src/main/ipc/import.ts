import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { ImportService } from '../import/import-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerImportHandlers({ settings, telemetry, repo, push }: HandlerContext): void {
  const importService = new ImportService(repo, settings.getLibraryRoot())
  const activeImports = new Map<string, AbortController>()

  registerIpcHandler(IPC_CHANNELS.IMPORT_START, async (args) => {
    const batchId = randomUUID()
    const controller = new AbortController()
    activeImports.set(batchId, controller)

    // Telemetry: counts only — NEVER paths or filenames.
    telemetry.get().track(TELEMETRY_EVENTS.IMPORT_STARTED, { paths: args.paths.length })
    const startedAt = Date.now()

    try {
      const summary = await importService.importPaths(args.paths, {
        batchId,
        signal: controller.signal,
        onProgress: (progress) => {
          push(IPC_CHANNELS.IMPORT_PROGRESS, progress)
        }
      })
      // Telemetry: counts + duration only — NEVER paths or filenames.
      telemetry.get().track(TELEMETRY_EVENTS.IMPORT_COMPLETED, {
        imported: summary.imported,
        duplicates: summary.duplicates,
        errors: summary.errors,
        durationMs: Date.now() - startedAt
      })
      return summary
    } finally {
      activeImports.delete(batchId)
    }
  })

  registerIpcHandler(IPC_CHANNELS.IMPORT_CANCEL, (args) => {
    const controller = activeImports.get(args.batchId)
    if (controller) {
      controller.abort()
      activeImports.delete(args.batchId)
      return { cancelled: true }
    }
    return { cancelled: false }
  })
}
