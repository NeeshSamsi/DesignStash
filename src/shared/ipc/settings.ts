import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { StashChangeModeSchema, StashChangeResultSchema, StashInfoSchema, StashMoveProgressSchema } from '../stash'

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
  },
  [IPC_CHANNELS.STASH_INFO]: {
    request: z.void(),
    response: StashInfoSchema
  },
  [IPC_CHANNELS.STASH_CHANGE]: {
    request: z.object({ path: z.string().min(1), mode: StashChangeModeSchema }),
    response: StashChangeResultSchema
  },
  // PUSH EVENT (main -> renderer), listed in PUSH_CHANNELS. No invoke handler is registered.
  [IPC_CHANNELS.STASH_MOVE_PROGRESS]: {
    request: StashMoveProgressSchema,
    response: z.void()
  }
} as const
