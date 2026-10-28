import { dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './register'
import { PHOTOSHOP_EXTENSIONS } from '../psd/photoshop-file'

export function registerDialogHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      // A zip is looked inside for its PSDs; a PSB is taken like a PSD.
      filters: [{ name: 'PSDs and zips', extensions: [...PHOTOSHOP_EXTENSIONS, 'zip'] }]
    })
    return { paths: result.filePaths }
  })
}
