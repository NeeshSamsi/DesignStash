import { dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './register'

export function registerDialogHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      // A zip is looked inside for its PSDs.
      filters: [{ name: 'PSDs and zips', extensions: ['psd', 'zip'] }]
    })
    return { paths: result.filePaths }
  })
}
