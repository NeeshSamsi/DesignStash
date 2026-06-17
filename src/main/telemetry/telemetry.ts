import type { TelemetryEventName, TelemetryProps } from '../../shared/telemetry'

/**
 * The swappable telemetry seam. All call sites depend on this interface only.
 * The factory (`createTelemetry`) decides whether to hand back a no-op or the
 * real PostHog-backed implementation — see factory.ts.
 */
export interface Telemetry {
  track(event: TelemetryEventName | string, props?: TelemetryProps): void
  captureError(err: unknown, context?: TelemetryProps): void
  shutdown(): Promise<void>
}

/**
 * Does nothing. Used in tests, dev, when consent is off, or when no PostHog
 * key is present — guaranteeing no network call ever fires in those contexts.
 */
export class NoopTelemetry implements Telemetry {
  readonly kind = 'noop' as const
  // Param-less no-ops: a 0-arg function still satisfies the Telemetry signature.
  track(): void {}
  captureError(): void {}
  async shutdown(): Promise<void> {}
}
