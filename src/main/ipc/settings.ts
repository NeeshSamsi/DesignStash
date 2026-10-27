import { IPC_CHANNELS } from '@shared/ipc'
import { StashFolderService } from '../library/stash-folder-service'
import { undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerSettingsHandlers(ctx: HandlerContext): void {
  const { settings, repo, push } = ctx
  const stash = new StashFolderService(repo, settings, undefined, (p) =>
    push(IPC_CHANNELS.STASH_MOVE_PROGRESS, p)
  )

  registerIpcHandler(IPC_CHANNELS.STASH_INFO, () => stash.info())

  // Undoable until the restart: undo cancels the change waiting for it.
  registerIpcHandler(IPC_CHANNELS.STASH_CHANGE, async (args) => {
    const before = settings.get().pendingStash
    const result = await stash.change(args.path, args.mode)
    if (!result.ok) return result
    const after = settings.get().pendingStash
    return { ...result, ...undoEntry(ctx.undo.record(ctx.undo.pendingStashRecord(before, after))) }
  })
}
