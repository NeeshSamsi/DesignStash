import { IPC_CHANNELS } from '@shared/ipc'
import { CoverService } from '../library/cover-service'
import { PileTitles } from '../library/pile-titles'
import { undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerMockupHandlers(ctx: HandlerContext): void {
  const { repo, library, settings } = ctx
  const covers = new CoverService(repo, settings.getLibraryRoot())
  const titles = new PileTitles(repo)

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

  // Starring or unstarring several cards is one action in the undo history.
  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, async (args) => {
    const { record } = await ctx.dataOps.track(
      args.favourite ? 'Star' : 'Unstar',
      { mockupIds: args.ids },
      () => {
        for (const id of args.ids) repo.mockups.setFavourite(id, args.favourite)
      }
    )
    return { favourite: args.favourite, ...undoEntry(ctx.undo.record(record)) }
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_UPDATE, (args) => {
    // In a pile the title is the pile's base (Edit pile details renames the pile), and the variation is this mockup's.
    const m = repo.mockups.getMockup(args.mockupId)
    const pileId = m ? (m.isGroup ? m.id : m.groupId) : null
    if (pileId !== null) {
      if (m!.title !== args.title) titles.renameBase(pileId, args.title)
      if (args.variation !== undefined) titles.setVariation(args.mockupId, args.variation)
    }
    repo.mockups.updateMockupMeta(args.mockupId, {
      title: pileId !== null ? repo.mockups.getMockup(args.mockupId)!.title : args.title,
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
