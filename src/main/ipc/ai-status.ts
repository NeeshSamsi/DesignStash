import type { HandlerContext } from './context'
import { inferenceQueueFor } from './library-effects'

/** There are no invoke channels: the queue is fed by import and restore and reports through the `ai:status` push. */
export function registerAiStatusHandlers(ctx: HandlerContext): void {
  // Pick up what was waiting when the app last closed.
  void inferenceQueueFor(ctx)
    .resume()
    .catch((err: unknown) => console.error('[AI] Could not resume the queue:', err))
}
