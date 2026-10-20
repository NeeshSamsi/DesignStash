import { IPC_CHANNELS } from '@shared/ipc'
import { TrashService } from '../library/trash-service'
import type { HandlerContext } from './context'
import { enqueueInBackground, inferenceQueueFor, withPileMembers } from './ai-status'
import { pushInboxCounts } from './inbox'
import { registerIpcHandler } from './register'

function targetIds(args: { ids: number[] } | { mockupId: number }): number[] {
  return 'ids' in args ? args.ids : [args.mockupId]
}

export function registerTrashHandlers(ctx: HandlerContext): void {
  const { repo, library, settings } = ctx
  const trash = new TrashService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.LIBRARY_TRASH_LIST, () => ({
    items: repo.getTrash()
  }))

  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, (args) => {
    const ids = targetIds(args)
    const count = repo.moveManyToTrash(ids)
    inferenceQueueFor(ctx).cancel(withPileMembers(repo, ids))
    pushInboxCounts(ctx)
    return { ok: true, count }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, (args) => {
    const ids = targetIds(args)
    const count = repo.restoreMany(ids)
    enqueueInBackground(ctx, withPileMembers(repo, ids))
    pushInboxCounts(ctx)
    return { ok: true, count }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, async (args) => {
    const result = await library.deletePermanently(args.mockupId)
    pushInboxCounts(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_LIST, async () => ({ items: await trash.list() }))

  registerIpcHandler(IPC_CHANNELS.TRASH_STATS, () => trash.stats())

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE, async (args) => {
    const result = await trash.restore(args.ids)
    enqueueInBackground(ctx, withPileMembers(repo, result.restoredIds))
    pushInboxCounts(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE_ALL, async () => {
    const result = await trash.restoreAll()
    enqueueInBackground(ctx, withPileMembers(repo, result.restoredIds))
    pushInboxCounts(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_EMPTY, async () => {
    const result = await trash.empty()
    pushInboxCounts(ctx)
    return result
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_DELETE_ENTRY, async (args) => {
    const result = await trash.deleteEntries(args.ids)
    pushInboxCounts(ctx)
    return result
  })
}
