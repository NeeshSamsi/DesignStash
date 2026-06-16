import { z } from 'zod'

/** Example shared schema proving the zod wiring + `@shared` alias across processes. */
export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string()
})

export type AppInfo = z.infer<typeof appInfoSchema>
