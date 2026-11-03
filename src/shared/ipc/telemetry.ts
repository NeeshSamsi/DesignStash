import { z } from 'zod'
import { IPC_CHANNELS } from '../ipc-channels'
import { TelemetryEventSchema, TelemetryConsentSchema } from '../telemetry'

/** Telemetry. */
export const telemetryContract = {
  // Fire-and-forget renderer→main forward; main applies privacy gating before dispatch.
  [IPC_CHANNELS.TELEMETRY_TRACK]: {
    request: TelemetryEventSchema,
    response: z.void()
  },
  [IPC_CHANNELS.TELEMETRY_GET_CONSENT]: {
    request: z.void(),
    response: TelemetryConsentSchema
  },
  [IPC_CHANNELS.TELEMETRY_SET_CONSENT]: {
    request: TelemetryConsentSchema,
    response: TelemetryConsentSchema
  }
} as const
