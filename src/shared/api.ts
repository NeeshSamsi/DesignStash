import type { InvokeChannel, IpcRequest, IpcResponse, IpcResult, PushChannel } from './ipc'

/**
 * The typed surface exposed from the preload bridge to the renderer as `window.api`.
 */
export interface DesignStashApi {
  appName: string
  invoke<C extends InvokeChannel>(
    channel: C,
    args: IpcRequest<C>
  ): Promise<IpcResult<IpcResponse<C>>>
  /**
   * Listen to a main -> renderer push channel (PUSH_CHANNELS only; anything else throws).
   * The payload is NOT validated here: the preload stays schema-free. Renderer code should
   * go through `subscribePush`, which validates it against the channel's zod schema.
   */
  subscribe(channel: PushChannel, callback: (payload: unknown) => void): () => void
  getPathForFile(file: File): string
}
