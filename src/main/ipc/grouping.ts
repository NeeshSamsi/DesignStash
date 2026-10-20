import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import type { GroupMember } from '@shared/grouping'
import { GroupingService } from '../import/grouping-service'
import type { HandlerContext } from './context'
import { pushInboxCounts } from './inbox'
import { registerIpcHandler } from './register'

export function registerGroupingHandlers(ctx: HandlerContext): void {
  const { telemetry, repo } = ctx
  registerIpcHandler(IPC_CHANNELS.GROUPING_PROPOSE, (args) => {
    // Only what still waits in To sort: stashed, sorted and trashed mockups have left the board.
    const dbMockups = repo
      .getMockupsByBatchId(args.batchId)
      .filter((m) => m.stage === 'to_sort' && m.deletedAt === null)
    const members: GroupMember[] = dbMockups.map((m) => {
      const ctx = m.importContext as {
        batchId?: string
        folderTrail?: string[]
        originalFilename?: string
      } | null
      return {
        mockupId: m.id,
        fileName: ctx?.originalFilename ?? m.title,
        folderTrail: ctx?.folderTrail ?? [],
        coverPath: m.coverPath,
        isPrimary: false
      }
    })
    const result = GroupingService.suggest(args.batchId, members)
    // The IPC error carries this plain copy to the renderer's "Couldn't suggest piles" state.
    if (!result.ok) throw new Error(result.message)
    return result.proposal
  })

  registerIpcHandler(IPC_CHANNELS.GROUPING_CONFIRM, (args) => {
    repo.confirmGroupings(args.groups, args.singletonIds)
    repo.sortBoards.clear(args.batchId)
    repo.setStage([...args.groups.flatMap((g) => g.memberIds), ...args.singletonIds], 'to_stash')
    pushInboxCounts(ctx)
    // Telemetry: counts only — never group contents.
    telemetry.get().track(TELEMETRY_EVENTS.GROUP_CONFIRMED, {
      groups: args.groups.length,
      singletons: args.singletonIds.length
    })
    return { confirmed: true }
  })

  registerIpcHandler(IPC_CHANNELS.SORT_BOARD_SAVE, (board) => {
    repo.sortBoards.save(board)
    return { saved: true }
  })

  registerIpcHandler(IPC_CHANNELS.SORT_BOARD_LOAD, (args) => ({
    board: repo.sortBoards.load(args.batchId)
  }))
}
