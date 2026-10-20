import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'
import { LookOverService } from '../import/look-over-service'
import { registerIpcHandler } from './register'

export function registerApprovalHandlers(ctx: HandlerContext): void {
  const { repo, ai } = ctx
  const lookOver = new LookOverService(repo, () => ai.activeProvider())

  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_OPEN, () => lookOver.open())
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT, (args) => lookOver.saveDraft(args))
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SKIP, (args) => lookOver.skip(args.mockupId))
  registerIpcHandler(IPC_CHANNELS.LOOK_OVER_SET_RESUME, (args) =>
    lookOver.setResume(args.unitId, args.mockupId)
  )
}
