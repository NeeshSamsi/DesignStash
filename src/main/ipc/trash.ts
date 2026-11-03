import { IPC_CHANNELS } from '@shared/ipc'
import { TrashService } from '../library/trash-service'
import type { HandlerContext } from './context'
import { countsChanged, mockupsArrived, mockupsLeft } from './library-effects'
import { registerIpcHandler } from './register'

export function registerTrashHandlers(ctx: HandlerContext): void {
  const { repo, settings } = ctx
  const trash = new TrashService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, (args) => {
    const ids = args.ids
    const count = repo.trash.moveManyToTrash(ids)
    mockupsLeft(ctx, ids)
    countsChanged(ctx)
    return { ok: true, count }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, (args) => {
    const ids = args.ids
    const count = repo.trash.restoreMany(ids)
    mockupsArrived(ctx, ids)
    countsChanged(ctx)
    return { ok: true, count }
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_LIST, async () => ({ items: await trash.list() }))

  registerIpcHandler(IPC_CHANNELS.TRASH_STATS, () => trash.stats())

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE, async (args) => {
    const result = await trash.restore(args.ids)
    mockupsArrived(ctx, result.restoredIds)
    countsChanged(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE_ALL, async () => {
    const result = await trash.restoreAll()
    mockupsArrived(ctx, result.restoredIds)
    countsChanged(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_EMPTY, async () => {
    const result = await trash.empty()
    countsChanged(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_DELETE_ENTRY, async (args) => {
    const result = await trash.deleteEntries(args.ids)
    countsChanged(ctx)
    return result
  })
}
