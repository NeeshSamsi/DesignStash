import { IPC_CHANNELS } from '@shared/ipc'
import type { TelemetryEventName, TelemetryProps } from '@shared/telemetry'

/**
 * Fire-and-forget telemetry from the renderer. Forwards to the main process,
 * which applies all privacy gating (consent, env, key) before anything is sent.
 * Renderer code MUST use this rather than invoking the IPC channel directly.
 * Errors are swallowed — telemetry must never disrupt the UI.
 */
export function track(event: TelemetryEventName | string, props?: TelemetryProps): void {
  const payload = props === undefined ? { event } : { event, props }
  void window.api.invoke(IPC_CHANNELS.TELEMETRY_TRACK, payload).catch(() => {})
}
