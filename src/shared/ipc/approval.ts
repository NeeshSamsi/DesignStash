import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import {
  ApprovalQueueSchema,
  ApproveItemRequestSchema,
  ApproveItemResponseSchema,
  ApprovalSetCoverRequestSchema,
  LookOverProgressSchema,
  LookOverQueueSchema,
  SaveDraftRequestSchema,
  SaveDraftResponseSchema
} from '../approval'

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
  },
  [IPC_CHANNELS.LOOK_OVER_OPEN]: {
    request: z.void(),
    response: LookOverQueueSchema
  },
  [IPC_CHANNELS.LOOK_OVER_SAVE_DRAFT]: {
    request: SaveDraftRequestSchema,
    response: SaveDraftResponseSchema
  },
  /** Skip for now: a mockup on its own goes to the end of the queue. A pile member can't be skipped. */
  [IPC_CHANNELS.LOOK_OVER_SKIP]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ skipped: z.boolean() })
  },
  /** Finish later: remember the step, so coming back resumes there. */
  [IPC_CHANNELS.LOOK_OVER_SET_RESUME]: {
    request: z.object({ unitId: z.number(), mockupId: z.number() }),
    response: z.object({ saved: z.boolean() })
  },
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. No invoke handler is registered.
  [IPC_CHANNELS.LOOK_OVER_PROGRESS]: {
    request: LookOverProgressSchema,
    response: z.void()
  }
} as const
