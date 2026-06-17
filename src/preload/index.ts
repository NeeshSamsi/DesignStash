import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesignStashApi } from '@shared/api'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ImportProgress, AiDownloadProgress } from '@shared/ipc'

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
    return () => ipcRenderer.removeListener(IPC_CHANNELS.IMPORT_PROGRESS, handler)
  },
  onAiDownloadProgress: (callback: (progress: AiDownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: AiDownloadProgress) => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, handler)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
