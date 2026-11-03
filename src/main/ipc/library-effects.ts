import { IPC_CHANNELS } from '@shared/ipc'
import { InferenceQueue } from '../ai/inference-queue'
import { reportFirstSuggestion } from '../telemetry/events'
import type { HandlerContext } from './context'

/**
 * What the rest of the app must do when mockups leave the library's working set or come back to
 * it. Handlers call these instead of pairing the AI queue and the sidebar counts by hand, so a
 * change cannot forget one half. A pile and its members always move together. Within one handler,
 * call `countsChanged` last, after the records and the queue agree.
 */

const queues = new WeakMap<HandlerContext, InferenceQueue>()

/** The one background suggestion queue for this app. */
export function inferenceQueueFor(ctx: HandlerContext): InferenceQueue {
  let queue = queues.get(ctx)
  if (!queue) {
    queue = new InferenceQueue({
      repo: ctx.repo,
      getProvider: () => ctx.ai.activeProvider(),
      onStatus: (event) => {
        ctx.push(IPC_CHANNELS.AI_STATUS, event)
        if (event.updates.some((u) => u.status === 'ready')) {
          reportFirstSuggestion(ctx.settings, (name, props) => ctx.telemetry.get().track(name, props))
        }
        // "Still sniffing" also rides on the inbox counts.
        countsChanged(ctx)
      }
    })
    queues.set(ctx, queue)
  }
  return queue
}

/** Ids plus the members of any pile among them. */
function withPileMembers({ repo }: Pick<HandlerContext, 'repo'>, ids: number[]): number[] {
  return [...new Set(ids.flatMap((id) => repo.piles.collectGroupIds(id)))]
}

/** Mockups were trashed, tossed, removed or undone: their suggestions are no longer wanted. */
export function mockupsLeft(ctx: HandlerContext, ids: number[]): void {
  inferenceQueueFor(ctx).cancel(withPileMembers(ctx, ids))
}

/**
 * Mockups landed, were restored or were added back: queue their suggestions without making the
 * caller wait. A failure is logged, never thrown into an import or a restore.
 */
export function mockupsArrived(ctx: HandlerContext, ids: number[]): void {
  inferenceQueueFor(ctx)
    .enqueue(withPileMembers(ctx, ids))
    .catch((err: unknown) => console.error('[AI] Could not queue suggestions:', err))
}

/** Tell the renderer the sidebar counts after anything that moves mockups between inboxes, My Stash and Trash. */
export function countsChanged({ repo, push }: Pick<HandlerContext, 'repo' | 'push'>): void {
  push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, repo.inbox.getCounts())
}
