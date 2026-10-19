import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesignStashApi } from '@shared/api'
import { IPC_CHANNELS, isPushChannel } from '@shared/ipc-channels'
import type { ImportProgress, AiDownloadProgress } from '@shared/ipc'

/**
 * Sandbox-safe preload: imports ONLY from 'electron'. Keep this surface tiny and typed.
 * Validated IPC channels are added in M1.
 */
const subscribe: DesignStashApi['subscribe'] = (channel, callback) => {
  // Allowlist: the renderer can never listen on an arbitrary channel through this bridge.
  if (!isPushChannel(channel)) throw new Error(`Not a push channel: ${String(channel)}`)
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DesignStashApi = {
  appName: 'DesignStash',
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  subscribe,
  // Wrappers kept until their callers move to `subscribePush`.
  onImportProgress: (callback: (progress: ImportProgress) => void) =>
    subscribe(IPC_CHANNELS.IMPORT_PROGRESS, (payload) => callback(payload as ImportProgress)),
  onAiDownloadProgress: (callback: (progress: AiDownloadProgress) => void) =>
    subscribe(IPC_CHANNELS.AI_DOWNLOAD_PROGRESS, (payload) =>
      callback(payload as AiDownloadProgress)
    ),
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
