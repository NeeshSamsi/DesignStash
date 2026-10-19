import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { GroupingProposalSchema, GroupingConfirmRequestSchema } from '../grouping'

/** Grouping (Sort into piles). */
export const groupingContract = {
  [IPC_CHANNELS.GROUPING_PROPOSE]: {
    request: z.object({ batchId: z.string() }),
    response: GroupingProposalSchema
  },
  [IPC_CHANNELS.GROUPING_CONFIRM]: {
    request: GroupingConfirmRequestSchema,
    response: z.object({ confirmed: z.boolean() })
  }
} as const
