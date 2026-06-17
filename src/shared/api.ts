import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from './ipc'

/**
 * The typed surface exposed from the preload bridge to the renderer as `window.api`.
 */
export interface DesignStashApi {
  appName: string
  /**
   * Invoke a typed IPC channel.
   * Input and output are validated against the schema in src/shared/ipc.ts.
   */
  invoke<C extends IpcChannel>(channel: C, args: IpcRequest<C>): Promise<IpcResult<IpcResponse<C>>>
}
