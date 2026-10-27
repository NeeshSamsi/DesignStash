import { IPC_CHANNELS } from '@shared/ipc'
import { TELEMETRY_EVENTS } from '@shared/telemetry'
import { TO_SORT_BOARD, type GroupMember } from '@shared/grouping'
import { GroupingService } from '../import/grouping-service'
import type { HandlerContext } from './context'
import { countsChanged } from './library-effects'
import { registerIpcHandler } from './register'

export function registerGroupingHandlers(ctx: HandlerContext): void {
  const { telemetry, repo } = ctx
  // One board for everything in To sort, whichever import it came in with: the board's batchId is
  // always TO_SORT_BOARD.
  registerIpcHandler(IPC_CHANNELS.GROUPING_PROPOSE, () => {
    // Only what still waits in To sort: stashed, sorted and trashed mockups have left the board.
    const members: GroupMember[] = repo.sortBoards.waiting().map((m) => {
      const ctx = m.importContext as {
        batchId?: string
        folderTrail?: string[]
        originalFilename?: string
        archiveName?: string
        archiveTitle?: string
      } | null
      return {
        mockupId: m.id,
        fileName: ctx?.originalFilename ?? m.title,
        folderTrail: ctx?.folderTrail ?? [],
        coverPath: m.coverPath,
        isPrimary: false,
        ...(ctx?.archiveName ? { archive: ctx.archiveName } : {}),
        ...(ctx?.archiveTitle ? { archiveTitle: ctx.archiveTitle } : {})
      }
    })
    return GroupingService.proposeOrFallback(TO_SORT_BOARD, members)
  })

  registerIpcHandler(IPC_CHANNELS.GROUPING_CONFIRM, (args) => {
    // One transaction: piles laid out but still in To sort would hide from its list. A board opened
    // on a few ("Sort 3") confirms only those, and the rest of the saved board stays.
    const ids = [...args.groups.flatMap((g) => g.memberIds), ...args.singletonIds]
    repo.transaction(() => {
      repo.piles.confirmGroupings(args.groups, args.singletonIds)
      repo.sortBoards.remove(ids)
      repo.mockups.setStage(ids, 'to_stash')
    })
    countsChanged(ctx)
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

  registerIpcHandler(IPC_CHANNELS.SORT_BOARD_LOAD, () => ({ board: repo.sortBoards.load() }))
}
