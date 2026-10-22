import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import type { HandlerContext } from './context'
import { LookOverService } from '../import/look-over-service'
import { registerIpcHandler } from './register'

export function registerApprovalHandlers(ctx: HandlerContext): void {
  const { repo, ai, telemetry } = ctx
  const lookOver = new LookOverService(repo, () => ai.activeProvider())
  // Telemetry: which field changed, never what it was changed to.
  lookOver.onEdited = (fields) => {
    for (const field of fields) {
      telemetry.get().track(TELEMETRY_EVENTS.SUGGESTION_EDITED, { field })
    }
  }

  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_OPEN, () => lookOver.open())
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, (args) => lookOver.saveDraft(args))
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SKIP, async (args) => {
    const result = await lookOver.skip(args.mockupId)
    if (result.skipped) telemetry.get().track(TELEMETRY_EVENTS.AI_ITEM_SKIPPED)
    return result
  })
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SET_RESUME, (args) =>
    lookOver.setResume(args.unitId, args.mockupId)
  )
}
