import { z } from 'zod'
import { AiStatusSchema } from '../inbox'

/**
 * Where a run that has started is (design L6). `starting`: it waits for the model to load (a cold
 * start, after launch, five idle minutes or a model switch). `writing`: the model is on it, since
 * `writingSince` (epoch ms), the clock for "taking a while", which shows after `slowAfterMs`.
 */
export const AiRunSchema = z.object({
  phase: z.enum(['starting', 'writing']),
  writingSince: z.number().nullable(),
  /** About 2.5 times this Mac's usual time for the model, within the model's floor and ceiling (`run-timing.ts`). */
  slowAfterMs: z.number()
})
export type AiRun = z.infer<typeof AiRunSchema>

/** One mockup's status: `pending` is queued, `sniffing` has a run, which says where it is. */
export const AiStatusUpdateSchema = z.object({
  mockupId: z.number(),
  status: AiStatusSchema,
  run: AiRunSchema.optional()
})
export type AiStatusUpdate = z.infer<typeof AiStatusUpdateSchema>

export const AiStatusEventSchema = z.object({
  /** Mockups whose status just changed. */
  updates: z.array(AiStatusUpdateSchema),
  /** For "Still sniffing 7 of 38": `remaining` of the `total` mockups in To sort still have no suggestion. */
  totals: z.object({ total: z.number(), remaining: z.number() })
})
export type AiStatusEvent = z.infer<typeof AiStatusEventSchema>
