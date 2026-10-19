import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerTrashHandlers({ repo, library }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.LIBRARY_TRASH_LIST, () => ({
    items: repo.getTrash()
  }))

  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, (args) => {
    repo.moveToTrash(args.mockupId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, (args) => {
    repo.restore(args.mockupId)
    return { ok: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, async (args) =>
    library.deletePermanently(args.mockupId)
  )
}
