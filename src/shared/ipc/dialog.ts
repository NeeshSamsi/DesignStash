import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

/** Native file dialogs. */
export const dialogContract = {
  [IPC_CHANNELS.DIALOG_SELECT_DIRECTORY]: {
    request: z.void(),
    response: z.object({ path: z.string().nullable() })
  },
  [IPC_CHANNELS.DIALOG_SELECT_PSD_FILES]: {
    request: z.void(),
    response: z.object({ paths: z.array(z.string()) })
  }
} as const
