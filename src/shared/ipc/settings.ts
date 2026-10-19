import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/** Settings. */
export const settingsContract = {
  [IPC_CHANNELS.SETTINGS_GET]: {
    request: z.void(),
    response: z.object({
      libraryRoot: z.string(),
      onboarded: z.boolean(),
      telemetryEnabled: z.boolean()
    })
  },
  [IPC_CHANNELS.SETTINGS_SET_LIBRARY_ROOT]: {
    request: z.object({ path: z.string().min(1) }),
    response: z.object({ libraryRoot: z.string() })
  }
} as const
