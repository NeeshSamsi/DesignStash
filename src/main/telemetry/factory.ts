import type { Telemetry } from './telemetry'
import { NoopTelemetry } from './telemetry'
import { PostHogTelemetry } from './posthog-telemetry'

export interface CreateTelemetryOptions {
  enabled: boolean
  isProd: boolean
  isTest: boolean
  installId: string
  apiKey?: string | undefined
  host?: string | undefined
}

/**
 * Single decision point for the telemetry seam (spec §13 privacy).
 * Returns a NoopTelemetry — guaranteeing zero network activity — unless ALL of:
 *   - the user has consented (`enabled`)
 *   - we are in a production build (`isProd`)
 *   - we are NOT under test (`!isTest`)
 *   - a PostHog API key is configured (`apiKey`)
 * Only then is the real PostHogTelemetry returned.
 */
export function createTelemetry(opts: CreateTelemetryOptions): Telemetry {
  const { enabled, isProd, isTest, installId, apiKey, host } = opts
  if (!enabled || !isProd || isTest || !apiKey) {
    return new NoopTelemetry()
  }
  return new PostHogTelemetry({ apiKey, host, installId })
}
