import { z } from 'zod'

/** Drift report between DB rows and Library files on disk (spec §3.8, M9). */
export const IntegrityReportSchema = z.object({
  orphanFiles: z.array(z.string()),
  orphanRecords: z.array(z.object({ mockupId: z.number(), libraryPath: z.string() }))
})
export type IntegrityReport = z.infer<typeof IntegrityReportSchema>
