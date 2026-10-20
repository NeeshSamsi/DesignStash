import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { CopyQueue } from '../import/copy-queue'
import { ImportService } from '../import/import-service'
import type { HandlerContext } from './context'
import { enqueueInBackground, inferenceQueueFor } from './ai-status'
import { pushInboxCounts } from './inbox'
import { registerIpcHandler } from './register'

export function registerImportHandlers(ctx: HandlerContext): void {
  const { settings, telemetry, repo, push } = ctx
  const importService = new ImportService(repo, settings.getLibraryRoot())
  const activeImports = new Map<string, AbortController>()

  // The resumable copy queue. Landed files wait in To sort and go to the AI queue as they arrive.
  const copyQueue = new CopyQueue({
    repo,
    libraryRoot: settings.getLibraryRoot(),
    onProgress: (progress) => push(IPC_CHANNELS.COPY_PROGRESS, progress),
    onLanded: (ids) => {
      enqueueInBackground(ctx, ids)
      pushInboxCounts(ctx)
    }
  })
  // Carry on a haul that was running when the app last closed.
  void copyQueue.resume().catch((err: unknown) => console.error('[Copy] Could not resume:', err))

  registerIpcHandler(IPC_CHANNELS.COPY_START, async (args) => {
    // Telemetry: counts only, never paths or file names.
    telemetry.get().track(TELEMETRY_EVENTS.IMPORT_STARTED, { paths: args.paths.length })
    return copyQueue.start(args.paths)
  })
  registerIpcHandler(IPC_CHANNELS.COPY_STATUS, async () => ({ haul: await copyQueue.status() }))
  registerIpcHandler(IPC_CHANNELS.COPY_CANCEL, (args) => copyQueue.cancel(args.haulId))
  registerIpcHandler(IPC_CHANNELS.COPY_RETRY, (args) => copyQueue.retry(args.haulId))
  registerIpcHandler(IPC_CHANNELS.COPY_UNDO_ALL, async (args) => {
    const result = await copyQueue.undoAll(args.haulId)
    inferenceQueueFor(ctx).cancel(result.tossedIds)
    pushInboxCounts(ctx)
    return result
  })

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
      pushInboxCounts(ctx)
      // Suggestions are made in the background as files land.
      enqueueInBackground(
        ctx,
        summary.items.flatMap((item) => (item.mockupId === undefined ? [] : [item.mockupId]))
      )
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
