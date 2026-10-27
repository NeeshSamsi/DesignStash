import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { DriftReportSchema, RelinkOutcomeSchema } from '../integrity'
import { StashCheckStatusSchema } from '../stash'
import { withUndoEntry } from './undo'

/** Integrity (stash check). */
export const integrityContract = {
  [IPC_CHANNELS.STASH_CHECK_STATUS]: {
    request: z.void(),
    response: StashCheckStatusSchema
  },
  [IPC_CHANNELS.STASH_CHECK_RUN]: {
    request: z.void(),
    response: StashCheckStatusSchema
  },
  [IPC_CHANNELS.INTEGRITY_REPORT]: { request: z.void(), response: DriftReportSchema },
  [IPC_CHANNELS.INTEGRITY_ADD]: {
    request: z.object({ ids: z.array(z.string()).min(1) }),
    response: withUndoEntry(z.object({ mockupIds: z.array(z.number()) }))
  },
  [IPC_CHANNELS.INTEGRITY_ADD_ALL]: {
    request: z.void(),
    response: withUndoEntry(z.object({ mockupIds: z.array(z.number()) }))
  },
  [IPC_CHANNELS.INTEGRITY_REMOVE]: {
    request: z.object({ ids: z.array(z.string()).min(1) }),
    response: z.object({ removed: z.number() })
  },
  [IPC_CHANNELS.INTEGRITY_REMOVE_ALL]: {
    request: z.void(),
    response: z.object({ removed: z.number() })
  },
  /** Main opens the file dialog itself, so no path crosses the bridge in either direction. */
  [IPC_CHANNELS.INTEGRITY_RELINK]: {
    request: z.object({ id: z.string() }),
    response: z.object({ outcome: RelinkOutcomeSchema })
  },
  [IPC_CHANNELS.INTEGRITY_IGNORE]: {
    request: z.object({ ids: z.array(z.string()).min(1) }),
    response: withUndoEntry(z.object({ ignoredIds: z.array(z.string()) }))
  },
  [IPC_CHANNELS.INTEGRITY_IGNORE_ALL]: {
    request: z.void(),
    response: withUndoEntry(z.object({ ignoredIds: z.array(z.string()) }))
  }
} as const
