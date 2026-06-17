import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesignStashApi } from '@shared/api'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ImportProgress } from '@shared/ipc'

/**
 * Sandbox-safe preload: imports ONLY from 'electron'. Keep this surface tiny and typed.
 * Validated IPC channels are added in M1.
 */
const api: DesignStashApi = {
  appName: 'DesignStash',
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  onImportProgress: (callback: (progress: ImportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ImportProgress) => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.IMPORT_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.IMPORT_PROGRESS, handler)
    }
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
