/**
 * The typed surface exposed from the preload bridge to the renderer as `window.api`.
 * Real, zod-validated IPC channels are added in M1; this is the minimal stub.
 */
export interface DesignStashApi {
  appName: string
}
