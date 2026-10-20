import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

function targetIds(args: { ids: number[] } | { mockupId: number }): number[] {
  return 'ids' in args ? args.ids : [args.mockupId]
}

export function registerTrashHandlers({ repo, library }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.LIBRARY_TRASH_LIST, () => ({
    items: repo.getTrash()
  }))

  registerIpcHandler(IPC_CHANNELS.MOCKUP_TRASH, (args) => {
    return { ok: true, count: repo.moveManyToTrash(targetIds(args)) }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_RESTORE, (args) => {
    return { ok: true, count: repo.restoreMany(targetIds(args)) }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DELETE_PERMANENT, async (args) =>
    library.deletePermanently(args.mockupId)
  )
}
