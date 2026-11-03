import { IPC_CHANNELS } from '@shared/ipc'
import { InboxService } from '../library/inbox-service'
import type { HandlerContext } from './context'
import { countsChanged, mockupsLeft } from './library-effects'
import { registerIpcHandler } from './register'

export function registerInboxHandlers(ctx: HandlerContext): void {
  const { repo, settings } = ctx
  const inbox = new InboxService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.INBOX_LIST, async (args) => ({
    items: await inbox.list(args.stage)
  }))

  registerIpcHandler(IPC_CHANNELS.INBOX_COUNTS, () => inbox.counts())

  registerIpcHandler(IPC_CHANNELS.INBOX_TOSS, async (args) => {
    const result = await inbox.toss(args.ids)
    mockupsLeft(ctx, result.tossedIds)
    countsChanged(ctx)
    return result
  })
}
