import { z } from 'zod'

export const StashInfoSchema = z.object({
  /** The stash folder, for display in Settings. */
  path: z.string(),
  /** Mockups in the stash folder. */
  count: z.number(),
  /** The space their PSDs take, in bytes. */
  bytes: z.number(),
  /** A new folder has been chosen and takes effect after a restart. */
  restartRequired: z.boolean()
})
export type StashInfo = z.infer<typeof StashInfoSchema>

export const StashChangeModeSchema = z.enum(['move', 'point'])
export type StashChangeMode = z.infer<typeof StashChangeModeSchema>

/** Plain reasons a stash folder change did not happen. The original folder is untouched in every case. */
export const StashChangeFailureSchema = z.enum([
  'same-folder',
  'inside-stash',
  'not-a-folder',
  'not-empty',
  'not-writable',
  'no-space',
  'verify-failed',
  'failed'
])
export type StashChangeFailure = z.infer<typeof StashChangeFailureSchema>

export const StashChangeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), restartRequired: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: StashChangeFailureSchema })
])
export type StashChangeResult = z.infer<typeof StashChangeResultSchema>

/** Progress of moving the stash, pushed as it goes. */
export const StashMoveProgressSchema = z.object({
  phase: z.enum(['copying', 'verifying', 'finishing']),
  copiedFiles: z.number(),
  totalFiles: z.number(),
  copiedBytes: z.number(),
  totalBytes: z.number()
})
export type StashMoveProgress = z.infer<typeof StashMoveProgressSchema>

/** When the stash was last compared with its records. `lastRun` is null until the first check. */
export const StashCheckStatusSchema = z.object({
  lastRun: z
    .object({
      /** ISO time. */
      at: z.string(),
      trigger: z.enum(['launch', 'manual']),
      result: z.enum(['in-sync', 'review', 'could-not-check']),
      /** Files and mockups that need a look. 0 unless `result` is 'review'. */
      toReview: z.number()
    })
    .nullable()
})
export type StashCheckStatus = z.infer<typeof StashCheckStatusSchema>
