import { IPC_CHANNELS } from '@shared/ipc'
import { InboxService } from '../library/inbox-service'
import type { HandlerContext } from './context'
import { undoEntry } from '../undo/undo-service'
import { countsChanged, mockupsLeft } from './library-effects'
import { registerIpcHandler } from './register'

export function registerInboxHandlers(ctx: HandlerContext): void {
  const inbox = new InboxService(ctx.repo)

  registerIpcHandler(IPC_CHANNELS.INBOX_LIST, async (args) => ({
    items: await inbox.list(args.stage)
  }))

  registerIpcHandler(IPC_CHANNELS.INBOX_COUNTS, () => inbox.counts())

  // One action in the undo history, however many mockups: its undo puts them back in their inbox.
  registerIpcHandler(IPC_CHANNELS.INBOX_TOSS, async (args) => {
    const { result, record } = await ctx.dataOps.track(
      'Toss',
      { mockupIds: inbox.tossable(args.ids) },
      () => inbox.toss(args.ids)
    )
    mockupsLeft(ctx, result.tossedIds)
    countsChanged(ctx)
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  })
}
