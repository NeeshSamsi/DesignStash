import { IPC_CHANNELS } from '@shared/ipc'
import type { HandlerContext } from './context'
import { registerIpcHandler } from './register'

export function registerTelemetryHandlers({ settings, telemetry }: HandlerContext): void {
  registerIpcHandler(IPC_CHANNELS.TELEMETRY_GET_CONSENT, () => ({
    enabled: settings.get().telemetryEnabled
  }))

  registerIpcHandler(IPC_CHANNELS.TELEMETRY_SET_CONSENT, (args) => {
    // Setting consent also marks onboarding complete (first-run disclosure, spec §13.3a) —
    // the smallest clean way to record the disclosure was shown without a separate channel.
    settings.update({ telemetryEnabled: args.enabled, onboarded: true })
    // Rebuild so toggling consent on/off takes effect immediately (Noop <-> PostHog).
    telemetry.rebuild()
    return { enabled: args.enabled }
  })

  // Fire-and-forget forward from the renderer. No-op-safe when consent is off.
  registerIpcHandler(IPC_CHANNELS.TELEMETRY_TRACK, (args) => {
    telemetry.get().track(args.event, args.props)
  })
}
