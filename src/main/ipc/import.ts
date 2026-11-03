import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { CopyQueue } from '../import/copy-queue'
import { createImportCompletedReporter } from '../telemetry/events'
import type { HandlerContext } from './context'
import { countsChanged, mockupsArrived, mockupsLeft } from './library-effects'
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
    onProgress: (progress) => {
      push(IPC_CHANNELS.COPY_PROGRESS, progress)
      reportImportCompleted(progress)
    },
    onLanded: (ids) => {
      mockupsArrived(ctx, ids)
      countsChanged(ctx)
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
    mockupsLeft(ctx, result.tossedIds)
    countsChanged(ctx)
    return result
  })
}
