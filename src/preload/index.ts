import { contextBridge, ipcRenderer } from 'electron'
import type { DesignStashApi } from '@shared/api'

/**
 * Sandbox-safe preload: imports ONLY from 'electron'. Keep this surface tiny and typed.
 * Validated IPC channels are added in M1.
 */
const api: DesignStashApi = {
  appName: 'DesignStash',
  invoke: (channel, args) => ipcRenderer.invoke(channel, args)
}

contextBridge.exposeInMainWorld('api', api)
