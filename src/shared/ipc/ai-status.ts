import { z } from 'zod'
import { AiStatusSchema } from '../inbox'

export const AiStatusEventSchema = z.object({
  /** Mockups whose status just changed. */
  updates: z.array(z.object({ mockupId: z.number(), status: AiStatusSchema })),
  /** For "Still sniffing 7 of 38": `remaining` of the `total` mockups in To sort still have no suggestion. */
  totals: z.object({ total: z.number(), remaining: z.number() })
})
export type AiStatusEvent = z.infer<typeof AiStatusEventSchema>
