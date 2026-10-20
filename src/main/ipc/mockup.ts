import { IPC_CHANNELS } from '@shared/ipc'
import { CoverService } from '../library/cover-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerMockupHandlers({ repo, library, settings }: HandlerContext): void {
  const covers = new CoverService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.MOCKUP_DETAIL, (args) => {
    const detail = repo.library.getMockupDetail(args.mockupId)
    if (!detail.mockup) throw new Error(`Mockup ${args.mockupId} not found`)
    const [row] = repo.library.toRows([detail.mockup])
    if (!row) throw new Error(`Mockup ${args.mockupId} not found`)
    return {
      item: { ...row, description: detail.mockup.description ?? null, tags: detail.tags },
      variants: repo.library.getDetailVariants(args.mockupId)
    }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, (args) => {
    repo.mockups.setFavourite(args.mockupId, args.favourite)
    return { favourite: args.favourite }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_UPDATE, (args) => {
    repo.mockups.updateMockupMeta(args.mockupId, {
      title: args.title,
      description: args.description,
      tagIds: args.tagIds
    })
    return { updated: true }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, async (args) =>
    library.openExternal(args.mockupId)
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_COVER, (args) =>
    covers.setCover(args.mockupId, args.filePath)
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, (args) =>
    covers.useEmbeddedCover(args.mockupId)
  )
}
