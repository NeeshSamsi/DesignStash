import { dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { registerIpcHandler } from './register'

export function registerDialogHandlers(): void {
  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    return { path }
  })

  registerIpcHandler(IPC_CHANNELS.DIALOG_SELECT_PSD_FILES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PSD Files', extensions: ['psd'] }]
    })
    return { paths: result.filePaths }
  })
}
