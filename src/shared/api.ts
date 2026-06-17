import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  IpcResult,
  ImportProgress,
  AiDownloadProgress
} from './ipc'

/**
 * The typed surface exposed from the preload bridge to the renderer as `window.api`.
 */
export interface DesignStashApi {
  appName: string
  invoke<C extends IpcChannel>(
    channel: C,
    args: IpcRequest<C>
  ): Promise<IpcResult<IpcResponse<C>>>
  onImportProgress(callback: (progress: ImportProgress) => void): () => void
  onAiDownloadProgress(callback: (progress: AiDownloadProgress) => void): () => void
  getPathForFile(file: File): string
}
