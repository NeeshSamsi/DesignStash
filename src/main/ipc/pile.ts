import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { LookOverService } from '../import/look-over-service'
import { StashService } from '../import/stash-service'
import { PileService } from '../library/pile-service'
import { PileTitles } from '../library/pile-titles'
import type { StashResult } from '@shared/approval'
import { pilesOf, undoEntry } from '../undo/undo-service'
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
    if (pileId !== null && repo.mockups.getMockup(pileId)?.stage === 'to_stash')
      await lookOver.draftsFor(pileId)
  }

  // A mockup that joins takes its file marker or number at once; the model then names the pile again (L8).
  const joined = <T extends { pileId: number }>(result: T): T => {
    void inferenceQueueFor(ctx).askPile(result.pileId)
    return result
  }

  registerIpcHandler(IPC_CHANNELS.PILE_CREATE, (args) =>
    joined(piles.create(args.memberIds, args.topId))
  )
  registerIpcHandler(IPC_CHANNELS.PILE_ADD, (args) =>
    joined(piles.add(args.pileId, args.memberIds))
  )
  registerIpcHandler(IPC_CHANNELS.PILE_MERGE, (args) =>
    joined(piles.merge(args.sourceIds, args.targetId))
  )
  registerIpcHandler(IPC_CHANNELS.PILE_SET_TOP, (args) => piles.setTop(args.pileId, args.topId))
  // Disbanding several piles is one action in the undo history. Every id must be a pile, or none
  // is disbanded.
  registerIpcHandler(IPC_CHANNELS.PILE_DISBAND, async (args) => {
    for (const id of args.pileIds) {
      if (!repo.mockups.getMockup(id)?.isGroup) throw new Error(`${id} is not a pile`)
    }
    const { result, record } = await ctx.dataOps.track(
      args.pileIds.length > 1 ? 'Disband piles' : 'Disband pile',
      { mockupIds: pilesOf(ctx.dataOps.scopes, args.pileIds) },
      () => {
        const done = args.pileIds.map((id) => piles.disband(id))
        return {
          snapshot: { rows: done.flatMap((d) => d.snapshot.rows) },
          freedIds: done.flatMap((d) => d.freedIds)
        }
      }
    )
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  })
  registerIpcHandler(IPC_CHANNELS.PILE_REMOVE, (args) =>
    piles.removeFromPile(args.pileId, args.mockupId)
  )
  registerIpcHandler(IPC_CHANNELS.PILE_RESTORE, (args) => piles.restore(args.snapshot))
  registerIpcHandler(IPC_CHANNELS.PILE_MEMBERS, (args) => ({
    items: repo.library.getPileItems(args.pileId)
  }))

  registerIpcHandler(IPC_CHANNELS.PILE_RENAME, async (args) => {
    await draftsReady(args.pileId)
    return titles.renameBase(args.pileId, args.base)
  })

  registerIpcHandler(IPC_CHANNELS.PILE_SET_VARIATION, async (args) => {
    const m = repo.mockups.getMockup(args.mockupId)
    await draftsReady(m ? (m.isGroup ? m.id : m.groupId) : null)
    return titles.setVariation(args.mockupId, args.words, args.source)
  })

  // Stash pile and Stash & next are one action each in the undo history, and in Look it over's own
  // steps: undo puts the mockups back in To stash with their drafts.
  const stashed = async (label: string, mockupIds: number[], run: () => Promise<StashResult>) => {
    const { result, record } = await ctx.dataOps.track(label, { mockupIds }, run)
    if (!result.ok) return result
    countsChanged(ctx)
    void approved(result.stashedIds.length).catch(() => {})
    return { ...result, ...undoEntry(ctx.undo.record(record)) }
  }

  registerIpcHandler(IPC_CHANNELS.PILE_STASH, (args) =>
    stashed('Stash pile', ctx.dataOps.scopes.pile(args.pileId), () => stash.stashPile(args.pileId))
  )

  registerIpcHandler(IPC_CHANNELS.MOCKUP_STASH, (args) =>
    stashed('Stash', [args.mockupId], () => stash.stashSingle(args.mockupId))
  )

  registerIpcHandler(IPC_CHANNELS.PILE_UNSTASH, async (args) => {
    const result = await stash.unstash(args.snapshot)
    countsChanged(ctx)
    return result
  })
}
