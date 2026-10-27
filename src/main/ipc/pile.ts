import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { LookOverService } from '../import/look-over-service'
import { StashService } from '../import/stash-service'
import { PileService } from '../library/pile-service'
import { PileTitles } from '../library/pile-titles'
import type { HandlerContext } from './context'
import { countsChanged, inferenceQueueFor } from './library-effects'
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
  const lookOver = new LookOverService(repo, () => ai.activeProvider())
  const stash = new StashService(repo, lookOver)
  const titles = new PileTitles(repo)
  // A pile waiting in To stash keeps its titles in its drafts: they are made before a title changes.
  const draftsReady = async (pileId: number | null) => {
    if (pileId !== null && repo.mockups.getMockup(pileId)?.stage === 'to_stash') await lookOver.draftsFor(pileId)
  }

  // A mockup that joins takes its file marker or number at once; the model then names the pile again (L8).
  const joined = <T extends { pileId: number }>(result: T): T => {
    void inferenceQueueFor(ctx).askPile(result.pileId)
    return result
  }

  registerIpcHandler(IPC_CHANNELS.PILE_CREATE, (args) => joined(piles.create(args.memberIds, args.topId)))
  registerIpcHandler(IPC_CHANNELS.PILE_ADD, (args) => joined(piles.add(args.pileId, args.memberIds)))
  registerIpcHandler(IPC_CHANNELS.PILE_MERGE, (args) => joined(piles.merge(args.sourceIds, args.targetId)))
  registerIpcHandler(IPC_CHANNELS.PILE_SET_TOP, (args) => piles.setTop(args.pileId, args.topId))
  registerIpcHandler(IPC_CHANNELS.PILE_DISBAND, (args) => piles.disband(args.pileId))
  registerIpcHandler(IPC_CHANNELS.PILE_REMOVE, (args) =>
    piles.removeFromPile(args.pileId, args.mockupId)
  )
  registerIpcHandler(IPC_CHANNELS.PILE_RESTORE, (args) => piles.restore(args.snapshot))
  registerIpcHandler(IPC_CHANNELS.PILE_MEMBERS, (args) => ({ items: repo.library.getPileItems(args.pileId) }))

  registerIpcHandler(IPC_CHANNELS.PILE_RENAME, async (args) => {
    await draftsReady(args.pileId)
    return titles.renameBase(args.pileId, args.base)
  })

  registerIpcHandler(IPC_CHANNELS.PILE_SET_VARIATION, async (args) => {
    const m = repo.mockups.getMockup(args.mockupId)
    await draftsReady(m ? (m.isGroup ? m.id : m.groupId) : null)
    return titles.setVariation(args.mockupId, args.words, args.source)
  })

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
