import { IPC_CHANNELS } from '@shared/ipc'
import { InferenceQueue } from '../ai/inference-queue'
import type { Repository } from '../db/repository'
import type { HandlerContext } from './context'

const queues = new WeakMap<HandlerContext, InferenceQueue>()

/** The one background suggestion queue for this app, shared by the import, inbox and Trash handlers. */
export function inferenceQueueFor(ctx: HandlerContext): InferenceQueue {
  let queue = queues.get(ctx)
  if (!queue) {
    queue = new InferenceQueue({
      repo: ctx.repo,
      getProvider: () => ctx.ai.activeProvider(),
      onStatus: (event) => {
        ctx.push(IPC_CHANNELS.AI_STATUS, event)
        // "Still sniffing" also rides on the inbox counts.
        ctx.push(IPC_CHANNELS.INBOX_COUNTS_CHANGED, ctx.repo.getInboxCounts())
      }
    })
    queues.set(ctx, queue)
  }
  return queue
}

/** Queue suggestions without making the caller wait. A failure is logged, never thrown into an import or a restore. */
export function enqueueInBackground(ctx: HandlerContext, ids: number[]): void {
  inferenceQueueFor(ctx)
    .enqueue(ids)
    .catch((err: unknown) => console.error('[AI] Could not queue suggestions:', err))
}

/** Ids plus the members of any pile among them: a pile's members are queued and cancelled with it. */
export function withPileMembers(repo: Repository, ids: number[]): number[] {
  return [...new Set(ids.flatMap((id) => repo.collectGroupIds(id)))]
}

/** There are no invoke channels: the queue is fed by import and restore and reports through the `ai:status` push. */
export function registerAiStatusHandlers(ctx: HandlerContext): void {
  // Pick up what was waiting when the app last closed.
  void inferenceQueueFor(ctx)
    .resume()
    .catch((err: unknown) => console.error('[AI] Could not resume the queue:', err))
}
