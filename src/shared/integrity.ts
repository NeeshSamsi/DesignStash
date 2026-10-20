import { z } from 'zod'

/** Drift report between DB rows and Library files on disk (spec §3.8, M9). */
export const IntegrityReportSchema = z.object({
  orphanFiles: z.array(z.string()),
  orphanRecords: z.array(z.object({ mockupId: z.number(), libraryPath: z.string() }))
})
export type IntegrityReport = z.infer<typeof IntegrityReportSchema>

/** A PSD that turned up in the stash folder. No path: `id` is how the renderer refers to it. */
export const FoundFileSchema = z.object({
  id: z.string(),
  /** The file's name without the extension. */
  name: z.string(),
  sizeBytes: z.number().nullable(),
  coverPath: z.string().optional()
})
export type FoundFile = z.infer<typeof FoundFileSchema>

/** A mockup whose PSD isn't in the stash folder any more. */
export const GoneRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  coverPath: z.string().optional()
})
export type GoneRecord = z.infer<typeof GoneRecordSchema>

/** What the stash check shows: names, sizes and covers, never a path to a PSD. */
export const DriftReportSchema = z.object({
  found: z.array(FoundFileSchema),
  gone: z.array(GoneRecordSchema)
})
export type DriftReport = z.infer<typeof DriftReportSchema>

export const RelinkOutcomeSchema = z.enum([
  'relinked',
  'cancelled',
  'not-psd',
  'already-in-stash',
  'failed'
])
export type RelinkOutcome = z.infer<typeof RelinkOutcomeSchema>
