import { IPC_CHANNELS } from '@shared/ipc'
import type { AiStatusEvent } from '@shared/ipc/ai-status'
import { InferenceQueue } from '../ai/inference-queue'
import { RunTimes } from '../ai/run-timing'
import { LookOverService } from '../import/look-over-service'
import { ensureSlotMask } from '../psd/design-slot-worker'
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
      prepare: ensureSlotMask,
      model: () => ctx.settings.get().activeModelId,
      timing: new RunTimes({
        get: () => ctx.settings.get().aiRunTimes,
        set: (aiRunTimes) => ctx.settings.update({ aiRunTimes })
      }),
      onStatus: (event) => {
        ctx.push(IPC_CHANNELS.AI_STATUS, event)
        if (event.updates.some((u) => u.status === 'ready')) {
          reportFirstSuggestion(ctx.settings, (name, props) => ctx.telemetry.get().track(name, props))
        }
        // "Still sniffing" also rides on the inbox counts.
        countsChanged(ctx)
        settleDrafts(ctx, event.updates)
      }
    })
    queues.set(ctx, queue)
  }
  return queue
}

/** The queue is done with these mockups: Look it over drafts waiting for them take what they got. */
function settleDrafts(ctx: HandlerContext, updates: AiStatusEvent['updates']): void {
  const done = updates.filter((u) => u.status === 'ready' || u.status === 'failed' || u.status === 'off')
  if (done.length === 0) return
  const lookOver = new LookOverService(ctx.repo, () => ctx.ai.activeProvider())
  // A suggestion that replaced an offered variant's words makes its offer's version again.
  lookOver.onItem = (item) => ctx.push(IPC_CHANNELS.LOOK_OVER_DRAFT, item)
  for (const { mockupId } of done) {
    lookOver
      .settle(mockupId)
      .then((item) => item && ctx.push(IPC_CHANNELS.LOOK_OVER_DRAFT, item))
      .catch((err: unknown) => console.error('[AI] Could not fill in a draft:', err))
  }
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
