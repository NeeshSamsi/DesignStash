import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { GroupingProposalSchema, GroupingConfirmRequestSchema, SortBoardSchema } from '../grouping'
import { withUndoEntry } from './undo'

/** Grouping (Sort into piles). */
export const groupingContract = {
  [IPC_CHANNELS.GROUPING_PROPOSE]: {
    request: z.object({ batchId: z.string() }),
    response: GroupingProposalSchema
  },
  [IPC_CHANNELS.GROUPING_CONFIRM]: {
    request: GroupingConfirmRequestSchema,
    response: withUndoEntry(z.object({ confirmed: z.boolean() }))
  },
  /** Finish later from Sort: keep the board as the user left it. */
  [IPC_CHANNELS.SORT_BOARD_SAVE]: {
    request: SortBoardSchema,
    response: z.object({ saved: z.boolean() })
  },
  /** The saved board, brought up to date with the library; null when there is none. */
  [IPC_CHANNELS.SORT_BOARD_LOAD]: {
    request: z.object({ batchId: z.string() }),
    response: z.object({ board: SortBoardSchema.nullable() })
  }
} as const
