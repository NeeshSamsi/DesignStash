import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'

export const BootStateSchema = z.enum([
  'ok',
  'library-failed',
  'folder-unavailable',
  'settings-corrupt'
])

export const FolderCheckSchema = z.object({
  state: z.enum(['ok', 'missing', 'not-writable']),
  /** A DesignStash library is already in the folder. */
  hasLibrary: z.boolean()
})

/** Launch problems and the onboarding folder check. Replies carry states only, never paths or messages. */
export const bootContract = {
  [IPC_CHANNELS.BOOT_STATUS]: {
    request: z.void(),
    response: z.object({ state: BootStateSchema, backupKept: z.boolean() })
  },
  [IPC_CHANNELS.BOOT_CHECK_FOLDER]: {
    request: z.object({ path: z.string().min(1) }),
    response: FolderCheckSchema
  }
} as const
