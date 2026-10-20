import { IPC_CHANNELS } from '@shared/ipc'
import { InboxService } from '../library/inbox-service'
import type { HandlerContext } from './context'
import { inferenceQueueFor } from './ai-status'
import { registerIpcHandler } from './register'

/** Tell the renderer the sidebar counts after anything that moves mockups between inboxes, My Stash and Trash. */
export function pushInboxCounts({ repo, push }: Pick<HandlerContext, 'repo' | 'push'>): void {
  push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, repo.getInboxCounts())
}

export function registerInboxHandlers(ctx: HandlerContext): void {
  const { repo, settings } = ctx
  const inbox = new InboxService(repo, settings.getLibraryRoot())

  registerIpcHandler(IPC_CHANNELS.INBOX_LIST, async (args) => ({
    items: await inbox.list(args.stage)
  }))

  registerIpcHandler(IPC_CHANNELS.INBOX_COUNTS, () => inbox.counts())

  registerIpcHandler(IPC_CHANNELS.INBOX_TOSS, async (args) => {
    const result = await inbox.toss(args.ids)
    inferenceQueueFor(ctx).cancel(result.tossedIds)
    pushInboxCounts(ctx)
    return result
  })
}
