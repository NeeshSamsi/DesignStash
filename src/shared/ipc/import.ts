import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

// ---- The copy queue (Gather) ----

/**
 * Why a file was left out. Plain codes: the screen turns them into words and never shows a path.
 * `archive-unsupported` is a .rar, .7z or encrypted zip; `no-psd-in-archive` is a zip with no PSD inside.
 */
export const CopySkipReasonSchema = z.enum([
  'not-psd',
  'duplicate',
  'unreadable',
  'archive-unsupported',
  'no-psd-in-archive'
])
export type CopySkipReason = z.infer<typeof CopySkipReasonSchema>

/** Why a haul stopped by itself. Retry carries on from the same file. */
export const CopyPauseReasonSchema = z.enum(['disk-full', 'source-gone'])
export type CopyPauseReason = z.infer<typeof CopyPauseReasonSchema>

export const CopyFileSchema = z.object({
  jobId: z.number(),
  /** The file's own name, never its folder. */
  name: z.string(),
  /** The zip it comes out of, by its file name as dropped. Absent for a PSD dropped as itself. */
  archiveName: z.string().optional(),
  status: z.enum(['queued', 'copying', 'done', 'skipped']),
  skipReason: CopySkipReasonSchema.optional(),
  /** The mockup it became, once it has landed in To sort. */
  mockupId: z.number().optional(),
  /** The file's mockup was in Trash and came back with its title, tags and description; nothing new was copied. */
  restored: z.literal(true).optional(),
  /** The file's size, and how much of it is copied so far (the row's own progress bar). */
  size: z.number().optional(),
  bytesCopied: z.number().optional()
})
export type CopyFile = z.infer<typeof CopyFileSchema>

const copyCountsShape = {
  haulId: z.string(),
  /** PSDs in the haul. */
  total: z.number(),
  /** Landed in To sort. */
  landed: z.number(),
  /** Bytes of every PSD in the haul, and how many of them are handled (copied, or left out). Overall progress counts these. */
  bytesTotal: z.number(),
  bytesCopied: z.number(),
  /** The recent copy speed. 0 until it can be measured. */
  bytesPerSecond: z.number(),
  /** Seconds left at that speed. null until the speed is known. */
  secondsLeft: z.number().nullable(),
  skipped: z.object({
    notPsd: z.number(),
    duplicate: z.number(),
    unreadable: z.number(),
    /** Archives left whole: .rar, .7z or encrypted zips. Each counts once. */
    archiveUnsupported: z.number(),
    /** Zips with no PSD inside. Each counts once. */
    noPsdInArchive: z.number()
  })
}

/**
 * A haul's overall figures. A paused haul always says why; every other state has no reason, so
 * "paused without a reason" and "running with one" cannot be sent.
 */
const copyCountsVariants = [
  z.object({ ...copyCountsShape, state: z.literal('paused'), pauseReason: CopyPauseReasonSchema }),
  z.object({ ...copyCountsShape, state: z.enum(['running', 'done', 'cancelled', 'undone']) })
] as const

/** The overall figures plus whatever else rides with them, as one union on `state`. */
function withExtra<S extends z.ZodRawShape>(extra: S) {
  return z.discriminatedUnion('state', [
    copyCountsVariants[0].extend(extra),
    copyCountsVariants[1].extend(extra)
  ])
}

/** A haul as the Gather screens show it: overall figures and every file. */
export const CopyStatusSchema = withExtra({ files: z.array(CopyFileSchema) })
export type CopyStatus = z.infer<typeof CopyStatusSchema>

/** Pushed as the queue moves: the overall figures and the one file that changed. */
export const CopyProgressSchema = withExtra({ file: CopyFileSchema.nullable() })
export type CopyProgress = z.infer<typeof CopyProgressSchema>

/** Import: copying PSDs into the stash. */
export const importContract = {
  // The resumable copy queue. New drops join the haul that is running.
  [IPC_CHANNELS.COPY_START]: {
    request: z.object({ paths: z.array(z.string()).min(1) }),
    response: CopyStatusSchema
  },
  [IPC_CHANNELS.COPY_STATUS]: {
    request: z.void(),
    /** The haul that is running or paused, else the latest one, else null. */
    response: z.object({ haul: CopyStatusSchema.nullable() })
  },
  /** Stop. What had already landed stays: keep it, or COPY_UNDO_ALL. */
  [IPC_CHANNELS.COPY_CANCEL]: {
    request: z.object({ haulId: z.string() }),
    response: z.object({ landedIds: z.array(z.number()) })
  },
  [IPC_CHANNELS.COPY_RETRY]: {
    request: z.object({ haulId: z.string() }),
    response: CopyStatusSchema
  },
  /** Remove everything this haul landed, records and the app's copies. Originals are never touched. */
  [IPC_CHANNELS.COPY_UNDO_ALL]: {
    request: z.object({ haulId: z.string() }),
    response: z.object({ tossedIds: z.array(z.number()) })
  }
} as const
