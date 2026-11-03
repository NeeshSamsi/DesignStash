import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import type { HandlerContext } from './context'
import { LookOverService } from '../import/look-over-service'
import { inferenceQueueFor } from './library-effects'
import { registerIpcHandler } from './register'

export function registerApprovalHandlers(ctx: HandlerContext): void {
  const { repo, ai, telemetry, push } = ctx
  const lookOver = new LookOverService(repo, () => ai.activeProvider())
  // An edit to a pile top, judged or offered on its variants in the background.
  lookOver.onItem = (item) => push(IPC_CHANNELS.LOOK_OVER_DRAFT, item)
  // Telemetry: which field changed, never what it was changed to.
  lookOver.onEdited = (fields) => {
    for (const field of fields) {
      telemetry.get().track(TELEMETRY_EVENTS.SUGGESTION_EDITED, { field })
    }
  }

  // What the person is looking at gets its suggestion first, then the rest of its pile (design L6).
  const showFirst = (mockupId: number) => inferenceQueueFor(ctx).prioritise(lookOver.walkFrom(mockupId))

  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_OPEN, async () => {
    const queue = await lookOver.open()
    const opensOn = queue.resume?.mockupId ?? queue.units[0]?.items[0]?.mockupId
    if (opensOn !== undefined) showFirst(opensOn)
    return queue
  })
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, (args) => lookOver.saveDraft(args))
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SKIP, async (args) => {
    const result = await lookOver.skip(args.mockupId)
    if (result.skipped) telemetry.get().track(TELEMETRY_EVENTS.AI_ITEM_SKIPPED)
    return result
  })
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SET_RESUME, (args) =>
    lookOver.setResume(args.unitId, args.mockupId)
  )
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT, (args) => lookOver.answerEdit(args))
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SHOWING, async ({ mockupId }) => {
    showFirst(mockupId)
    return inferenceQueueFor(ctx).statusOf(mockupId)
  })
}
