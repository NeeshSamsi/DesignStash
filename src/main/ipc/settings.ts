import { IPC_CHANNELS } from '@shared/ipc'
import { StashFolderService } from '../library/stash-folder-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerSettingsHandlers({ settings, repo, push }: HandlerContext): void {
  const stash = new StashFolderService(repo, settings, undefined, (p) =>
    push(IPC_CHANNELS.STASH_MOVE_PROGRESS, p)
  )

  registerIpcHandler(IPC_CHANNELS.STASH_INFO, () => stash.info())

  registerIpcHandler(IPC_CHANNELS.STASH_CHANGE, (args) => stash.change(args.path, args.mode))
}
