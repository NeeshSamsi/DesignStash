import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerMockupHandlers({ repo, library }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.MOCKUP_DETAIL, (args) => {
    const detail = repo.getMockupDetail(args.mockupId)
    if (!detail.mockup) throw new Error(`Mockup ${args.mockupId} not found`)
    const [row] = repo.library.toRows([detail.mockup])
    if (!row) throw new Error(`Mockup ${args.mockupId} not found`)
    return {
      item: { ...row, description: detail.mockup.description ?? null, tags: detail.tags },
      variants: repo.getDetailVariants(args.mockupId)
    }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, (args) => {
    repo.setFavourite(args.mockupId, args.favourite)
    return { favourite: args.favourite }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_UPDATE, (args) => {
    repo.updateMockupMeta(args.mockupId, {
      title: args.title,
      description: args.description,
      tagIds: args.tagIds
    })
    return { updated: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, async (args) =>
    library.openExternal(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DUPLICATE, async (args) =>
    library.duplicate(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.GROUP_UNGROUP, (args) => {
    repo.ungroupGroup(args.leaderId)
    return { ungrouped: true }
  })

  registerIpcHandler(IPC_CHANNELS.GROUP_DELETE, async (args) => {
    const result = await library.deleteGroup(args.leaderId)
    return { deleted: result.deleted }
  })
}
