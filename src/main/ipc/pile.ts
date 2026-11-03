import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { LookOverService } from '../import/look-over-service'
import { StashService } from '../import/stash-service'
import { PileService } from '../library/pile-service'
import type { HandlerContext } from './context'
import { countsChanged } from './library-effects'
import { registerIpcHandler } from './register'

export function registerPileHandlers(ctx: HandlerContext): void {
  const { repo, ai, telemetry } = ctx
  // Telemetry: how many mockups were approved into My Stash, and whether a model was on. Counts only.
  const approved = async (count: number) => {
    telemetry.get().track(TELEMETRY_EVENTS.AI_ITEM_APPROVED, {
      count,
      had_model: (await ai.activeProvider()) !== null
    })
  }
  const piles = new PileService(repo)
  const stash = new StashService(repo, new LookOverService(repo, () => ai.activeProvider()))

  registerIpcHandler(IPC_CHANNELS.PILE_CREATE, (args) => piles.create(args.memberIds, args.topId))
  registerIpcHandler(IPC_CHANNELS.PILE_ADD, (args) => piles.add(args.pileId, args.memberIds))
  registerIpcHandler(IPC_CHANNELS.PILE_MERGE, (args) => piles.merge(args.sourceIds, args.targetId))
  registerIpcHandler(IPC_CHANNELS.PILE_SET_TOP, (args) => piles.setTop(args.pileId, args.topId))
  registerIpcHandler(IPC_CHANNELS.PILE_DISBAND, (args) => piles.disband(args.pileId))
  registerIpcHandler(IPC_CHANNELS.PILE_REMOVE, (args) =>
    piles.removeFromPile(args.pileId, args.mockupId)
  )
  registerIpcHandler(IPC_CHANNELS.PILE_RESTORE, (args) => piles.restore(args.snapshot))

  registerIpcHandler(IPC_CHANNELS.PILE_STASH, async (args) => {
    const result = await stash.stashPile(args.pileId)
    if (result.ok) {
      countsChanged(ctx)
      void approved(result.stashedIds.length).catch(() => {})
    }
    return result
  })

  registerIpcHandler(IPC_CHANNELS.MOCKUP_STASH, async (args) => {
    const result = await stash.stashSingle(args.mockupId)
    if (result.ok) {
      countsChanged(ctx)
      void approved(result.stashedIds.length).catch(() => {})
    }
    return result
  })

  registerIpcHandler(IPC_CHANNELS.PILE_UNSTASH, async (args) => {
    const result = await stash.unstash(args.snapshot)
    countsChanged(ctx)
    return result
  })
}
