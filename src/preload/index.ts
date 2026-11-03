import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesignStashApi } from '@shared/api'
import { isPushChannel } from '@shared/ipc-channels'

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
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
