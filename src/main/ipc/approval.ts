import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import type { HandlerContext } from './context'
import { LookOverService } from '../import/look-over-service'
import { inferenceQueueFor } from './library-effects'
import { registerIpcHandler } from './register'

export function registerApprovalHandlers(ctx: HandlerContext): void {
  const { repo, ai, telemetry, push } = ctx
  const lookOver = new LookOverService(repo, () => ai.activeProvider(), { aiStatusOf: (id) => inferenceQueueFor(ctx).statusOf(id) })
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
    // Every mockup waits in the one queue (design L6): any the AI was never asked about joins it before its draft is made.
    await inferenceQueueFor(ctx).enqueue(lookOver.unasked())
    const queue = await lookOver.open()
    const opensOn = queue.resume?.mockupId ?? queue.units[0]?.items[0]?.mockupId
    if (opensOn !== undefined) showFirst(opensOn)
    // A pile whose own suggestions came in while Look it over was shut is named now that its drafts are made (L8).
    for (const unit of queue.units) if (unit.kind === 'pile') void inferenceQueueFor(ctx).askPile(unit.unitId)
    return queue
  })
  // The other mockups a save reached (a renamed base, a top's edit carried to its variants) go out
  // as look-over:draft before the save answers, so the window takes them without reopening the queue.
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, async (args) => {
    const saved = await lookOver.saveDraft(args)
    for (const id of saved.propagatedIds) {
      const item = await lookOver.item(id)
      if (item) push(IPC_CHANNELS.LOOK_OVER_DRAFT, item)
    }
    return saved
  })
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
  // Fill it myself (L6.E1): the draft stops waiting first, so an answer landing meanwhile can't fill it.
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_FILL_MYSELF, async ({ mockupId }) => {
    if (!(await lookOver.fillMyself(mockupId))) return null
    inferenceQueueFor(ctx).optOut(mockupId)
    return lookOver.item(mockupId)
  })
  // Write suggestions or Try again (L6.E1, L6.E3): the draft waits again, and the mockup on screen goes first.
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_WRITE, async ({ mockupId }) => {
    if (!(await lookOver.waitForAi(mockupId))) return null
    await inferenceQueueFor(ctx).askAgain(mockupId)
    showFirst(mockupId)
    return lookOver.item(mockupId)
  })
}
