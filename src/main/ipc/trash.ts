import { IPC_CHANNELS } from '@shared/ipc'
import { TrashService, type RestoreResult } from '../library/trash-service'
import { pilesOf, undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { countsChanged, mockupsArrived, mockupsLeft } from './library-effects'
import { registerIpcHandler } from './register'

export function registerTrashHandlers(ctx: HandlerContext): void {
  const { repo, settings } = ctx
  const trash = new TrashService(repo, settings.getLibraryRoot())

  // One action in the undo history. A pile member leaves its pile first (the repository does it),
  // so the entry covers its whole pile, and undo puts it back in.
  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, async (args) => {
    const ids = args.ids
    const { result: count, record } = await ctx.dataOps.track(
      'Move to Trash',
      { mockupIds: pilesOf(ctx.dataOps.scopes, ids) },
      () => repo.trash.moveManyToTrash(ids)
    )
    mockupsLeft(ctx, ids)
    countsChanged(ctx)
    return { ok: true, count, ...undoEntry(ctx.undo.record(record)) }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, async (args) => {
    const ids = args.ids
    const { result: count, record } = await ctx.dataOps.track(
      'Restore',
      { mockupIds: pilesOf(ctx.dataOps.scopes, ids) },
      () => repo.trash.restoreMany(ids)
    )
    mockupsArrived(ctx, ids)
    countsChanged(ctx)
    return { ok: true, count, ...undoEntry(ctx.undo.record(record)) }
  })

  registerIpcHandler(IPC_CHANNELS.TRASH_LIST, async () => ({ items: await trash.list() }))

  registerIpcHandler(IPC_CHANNELS.TRASH_STATS, () => trash.stats())

  // Restore puts a mockup back where it came from: My Stash or the inbox it was tossed from.
  const restored = async (
    label: string,
    mockupIds: number[],
    run: () => Promise<RestoreResult>
  ) => {
    const { result, record } = await ctx.dataOps.track(label, { mockupIds }, run)
    mockupsArrived(ctx, result.restoredIds)
    countsChanged(ctx)
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  }

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE, (args) =>
    restored('Restore', pilesOf(ctx.dataOps.scopes, args.ids), () => trash.restore(args.ids))
  )

  registerIpcHandler(IPC_CHANNELS.TRASH_RESTORE_ALL, () =>
    restored(
      'Restore all',
      repo.trash.getTrashEntries().flatMap((e) => e.ids),
      () => trash.restoreAll()
    )
  )

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
