import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { EntitlementsSnapshotSchema } from '../entitlements'

/** Entitlements. */
export const entitlementsContract = {
  [IPC_CHANNELS.ENTITLEMENTS_SNAPSHOT]: {
    request: z.void(),
    response: EntitlementsSnapshotSchema
  }
} as const
