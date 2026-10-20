import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

// ---- The copy queue (Gather) ----

/** Why a file was left out. Plain codes: the screen turns them into words and never shows a path. */
export const CopySkipReasonSchema = z.enum(['not-psd', 'duplicate', 'unreadable'])
export type CopySkipReason = z.infer<typeof CopySkipReasonSchema>

/** Why a haul stopped by itself. Retry carries on from the same file. */
export const CopyPauseReasonSchema = z.enum(['disk-full', 'source-gone'])
export type CopyPauseReason = z.infer<typeof CopyPauseReasonSchema>

export const CopyFileSchema = z.object({
  jobId: z.number(),
  /** The file's own name, never its folder. */
  name: z.string(),
  status: z.enum(['queued', 'copying', 'done', 'skipped']),
  skipReason: CopySkipReasonSchema.optional(),
  /** The mockup it became, once it has landed in To sort. */
  mockupId: z.number().optional(),
  /** The file's size, and how much of it is copied so far (the row's own progress bar). */
  size: z.number().optional(),
  bytesCopied: z.number().optional()
})
export type CopyFile = z.infer<typeof CopyFileSchema>

const CopyCountsSchema = z.object({
  haulId: z.string(),
  state: z.enum(['running', 'paused', 'done', 'cancelled', 'undone']),
  pauseReason: CopyPauseReasonSchema.nullable(),
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
  skipped: z.object({ notPsd: z.number(), duplicate: z.number(), unreadable: z.number() })
})

/** A haul as the Gather screens show it: overall figures and every file. */
export const CopyStatusSchema = CopyCountsSchema.extend({ files: z.array(CopyFileSchema) })
export type CopyStatus = z.infer<typeof CopyStatusSchema>

/** Pushed as the queue moves: the overall figures and the one file that changed. */
export const CopyProgressSchema = CopyCountsSchema.extend({ file: CopyFileSchema.nullable() })
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
