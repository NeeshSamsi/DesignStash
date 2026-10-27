import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { CopyQueue } from '../import/copy-queue'
import { writeDesignSlotMaskInWorker } from '../psd/design-slot-worker'
import { createImportCompletedReporter } from '../telemetry/events'
import type { HandlerContext } from './context'
import { countsChanged, mockupsArrived } from './library-effects'
import { registerIpcHandler } from './register'

export function registerImportHandlers(ctx: HandlerContext): void {
  const { settings, telemetry, repo, push } = ctx
  const reportImportCompleted = createImportCompletedReporter((event, props) =>
    telemetry.get().track(event, props)
  )
  // The resumable copy queue. Landed files wait in To sort and go to the AI queue as they arrive.
  const copyQueue = new CopyQueue({
    repo,
    libraryRoot: settings.getLibraryRoot(),
    // The design slot mask reads every layer's pixels, so it runs off the main thread.
    deps: { writeSlotMask: writeDesignSlotMaskInWorker },
    onProgress: (progress) => {
      push(IPC_CHANNELS.COPY_PROGRESS, progress)
      reportImportCompleted(progress)
    },
    onLanded: (ids) => {
      mockupsArrived(ctx, ids)
      countsChanged(ctx)
    },
    // "Undo import of 12 mockups": its undo moves what came in to Trash, redo brings it back.
    onStopped: (ids) =>
      ctx.undo.record(
        ctx.dataOps.importRecord(
          `Import of ${ids.length} mockup${ids.length === 1 ? '' : 's'}`,
          ids
        )
      )
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
}
