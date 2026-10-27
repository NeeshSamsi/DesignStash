import { IPC_CHANNELS } from '@shared/ipc'
import type { CoverChange } from '@shared/library'
import { CoverService, type CoverServiceDeps } from '../library/cover-service'
import { PileTitles } from '../library/pile-titles'
import { pilesOf, undoEntry } from '../undo/undo-service'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

/** `coverDeps`: for tests, the cover service's file and image work. */
export function registerMockupHandlers(
  ctx: HandlerContext,
  coverDeps?: Partial<CoverServiceDeps>
): void {
  const { repo, library, settings } = ctx
  const covers = new CoverService(repo, settings.getLibraryRoot(), coverDeps)
  /** Runs an action as one entry in the undo history, scoped to `mockupIds`. */
  const tracked = <T>(label: string, mockupIds: number[], run: () => T | Promise<T>) =>
    ctx.dataOps.track(label, { mockupIds }, run)
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

  // Field by field: undoing a title edit never wipes a description the AI wrote since.
  registerIpcHandler(IPC_CHANNELS.MOCKUP_UPDATE, async (args) => {
    const { record } = await tracked(
      'Edit details',
      pilesOf(ctx.dataOps.scopes, [args.mockupId]),
      () => updateDetails(args)
    )
    return { updated: true, ...undoEntry(ctx.undo.record(record)) }
  })

  function updateDetails(args: {
    mockupId: number
    title: string
    description: string
    tagIds: number[]
    variation?: string | undefined
  }): void {
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
  }

  registerIpcHandler(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, async (args) =>
    library.openExternal(args.mockupId)
  )

  // A cover change is recorded only when it happened. The replaced cover stays on disk for Undo.
  const coverChange = async (label: string, mockupId: number, run: () => Promise<CoverChange>) => {
    const { result, record } = await tracked(label, [mockupId], run)
    return result.ok ? { ...result, ...undoEntry(ctx.undo.record(record)) } : result
  }

  registerIpcHandler(IPC_CHANNELS.MOCKUP_SET_COVER, (args) =>
    coverChange('Replace cover', args.mockupId, () => covers.setCover(args.mockupId, args.filePath))
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER, (args) =>
    coverChange('Use the PSD’s preview', args.mockupId, () =>
      covers.useEmbeddedCover(args.mockupId)
    )
  )
}
