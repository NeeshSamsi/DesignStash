import { IPC_CHANNELS } from '@shared/ipc'
import { checkFolder, getBootStatus } from '../boot-status'
import { registerIpcHandler } from './register'

/**
 * Launch status and the onboarding folder check. These need no database, so they are registered
 * even when the library failed to open.
 */
export function registerBootHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.BOOT_STATUS, () => getBootStatus())

  registerIpcHandler(IPC_CHANNELS.BOOT_CHECK_FOLDER, (args) => checkFolder(args.path))
}
