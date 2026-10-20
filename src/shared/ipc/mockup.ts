import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { CoverChangeSchema, MockupDetailSchema } from '../library'

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
    response: z.discriminatedUnion('opened', [
      z.object({ opened: z.literal(true) }),
      z.object({ opened: z.literal(false), reason: z.enum(['no-app', 'failed']) })
    ])
  },
  [IPC_CHANNELS.MOCKUP_SET_COVER]: {
    request: z.object({ mockupId: z.number(), filePath: z.string().min(1) }),
    response: CoverChangeSchema
  },
  [IPC_CHANNELS.MOCKUP_USE_EMBEDDED_COVER]: {
    request: z.object({ mockupId: z.number() }),
    response: CoverChangeSchema
  }
} as const
