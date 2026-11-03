import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { AiStatusUpdateSchema } from './ai-status'
import { AnswerEditRequestSchema, LookOverItemSchema, LookOverQueueSchema, SaveDraftRequestSchema, SaveDraftResponseSchema } from '../approval'

/** Look it over. */
export const approvalContract = {
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
  /** The person's answer to the top's edit on one variant. The updated item, or null when nothing was in that state. */
  [IPC_CHANNELS.LOOK_OVER_ANSWER_EDIT]: {
    request: AnswerEditRequestSchema,
    response: LookOverItemSchema.nullable()
  },
  /**
   * The mockup now on screen (design L6). Its suggestion goes first in the background queue, then
   * the rest of its pile; answers with where it is (as `ai:status` says it), or null when it is gone.
   */
  [IPC_CHANNELS.LOOK_OVER_SHOWING]: {
    request: z.object({ mockupId: z.number() }),
    response: AiStatusUpdateSchema.nullable()
  }
} as const
