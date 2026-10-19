import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { IntegrityReportSchema } from '../integrity'

/** Integrity (stash check). */
export const integrityContract = {
  [IPC_CHANNELS.INTEGRITY_SCAN]: {
    request: z.void(),
    response: IntegrityReportSchema
  },
  [IPC_CHANNELS.INTEGRITY_ADD_ORPHAN]: {
    request: z.object({ filePath: z.string() }),
    response: z.object({ mockupId: z.number() })
  },
  [IPC_CHANNELS.INTEGRITY_DELETE_RECORD]: {
    request: z.object({ mockupId: z.number() }),
    response: z.object({ deleted: z.boolean() })
  }
} as const
