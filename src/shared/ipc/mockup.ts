import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { MockupDetailSchema } from '../library'

/** A single mockup or pile. */
export const mockupContract = {
  [IPC_CHANNELS.MOCKUP_DETAIL]: {
    request: z.object({ mockupId: z.number() }),
    response: MockupDetailSchema
  },
  [IPC_CHANNELS.MOCKUP_SET_FAVOURITE]: {
    request: z.object({ mockupId: z.number(), favourite: z.boolean() }),
    response: z.object({ favourite: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_UPDATE]: {
    request: z.object({ mockupId: z.number(), title: z.string().min(1), description: z.string(), tagIds: z.array(z.number()) }),
    response: z.object({ updated: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ opened: z.boolean() })
  },
  [IPC_CHANNELS.MOCKUP_DUPLICATE]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ newMockupId: z.number() })
  },
  [IPC_CHANNELS.GROUP_UNGROUP]: {
    request: z.object({ leaderId: z.number() }),
    response: z.object({ ungrouped: z.boolean() })
  },
  [IPC_CHANNELS.GROUP_DELETE]: {
    request: z.object({ leaderId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  }
} as const
