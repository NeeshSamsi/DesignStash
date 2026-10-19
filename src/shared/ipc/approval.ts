import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { ApprovalQueueSchema, ApproveItemRequestSchema, ApproveItemResponseSchema, ApprovalSetCoverRequestSchema } from '../approval'

/** Approval (Look it over). */
export const approvalContract = {
  [IPC_CHANNELS.APPROVAL_INIT]: {
    request: z.object({ batchId: z.string() }),
    response: ApprovalQueueSchema
  },
  [IPC_CHANNELS.APPROVAL_SAVE_ITEM]: {
    request: ApproveItemRequestSchema,
    response: ApproveItemResponseSchema
  },
  [IPC_CHANNELS.APPROVAL_SET_COVER]: {
    request: ApprovalSetCoverRequestSchema,
    response: z.object({ coverPath: z.string(), coverSource: z.literal('user-uploaded') })
  }
} as const
