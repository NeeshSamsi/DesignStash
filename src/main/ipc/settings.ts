import { IPC_CHANNELS } from '@shared/ipc'
import { StashFolderService } from '../library/stash-folder-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerSettingsHandlers({ settings, repo, push }: HandlerContext): void {
  const stash = new StashFolderService(repo, settings, undefined, (p) =>
    push(IPC_CHANNELS.STASH_MOVE_PROGRESS, p)
  )

  // Library location is a setting (default <userData>/Library); onboarding can override it.
  registerIpcHandler(IPC_CHANNELS.SETTINGS_GET, () => settings.get())

  registerIpcHandler(IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT, (args) => {
    // Persists the choice. Relocating an existing library + re-init applies on next launch
    // (full move/restart handled when onboarding lands).
    const next = settings.update({ libraryRoot: args.path })
    return { libraryRoot: next.libraryRoot }
  })

  registerIpcHandler(IPC_CHANNELS.STASH_INFO, () => stash.info())

  registerIpcHandler(IPC_CHANNELS.STASH_CHANGE, (args) => stash.change(args.path, args.mode))
}
