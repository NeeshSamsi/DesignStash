import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { AiStatusSchema } from '../inbox'

export const AiStatusEventSchema = z.object({
  /** Mockups whose status just changed. */
  updates: z.array(z.object({ mockupId: z.number(), status: AiStatusSchema })),
  /** For "Still sniffing 7 of 38": `remaining` of the `total` mockups in To sort still have no suggestion. */
  totals: z.object({ total: z.number(), remaining: z.number() })
})
export type AiStatusEvent = z.infer<typeof AiStatusEventSchema>

/** Background AI suggestions. Only a push event: the status of each mockup also rides on the inbox lists. */
export const aiStatusContract = {
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. `request` is the event payload;
  // `response: z.void()` is a placeholder and no invoke handler is registered.
  [IPC_CHANNELS.AI_STATUS]: {
    request: AiStatusEventSchema,
    response: z.void()
  }
} as const
