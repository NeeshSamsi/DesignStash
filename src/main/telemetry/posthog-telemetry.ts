import type { Telemetry } from './telemetry'
import type { TelemetryEventName, TelemetryProps } from '../../shared/telemetry'
import { scrubError } from './scrub'
import { logger } from '../logger'

/**
 * Minimal slice of the posthog-node client we depend on. Declaring it locally
 * lets tests inject a fake (so NO network happens) and keeps posthog-node out of
 * the static module graph — the real client is built via dynamic import on first use.
 */
export interface PostHogClientLike {
  capture(args: {
    distinctId: string
    event: string
    properties?: Record<string, unknown>
    disableGeoip?: boolean
  }): void
  captureException?(error: unknown, distinctId?: string, properties?: Record<string, unknown>): void
  shutdown(): Promise<void>
}

export interface PostHogTelemetryOptions {
  apiKey: string
  host?: string | undefined
  installId: string
  /** Injectable for tests — when provided, NO dynamic import / network occurs. */
  client?: PostHogClientLike | undefined
}

// Personless capture: pseudonymous events, no PostHog "person" profile created.
const ANON_PROPS = { $process_person_profile: false } as const

/**
 * PostHog-backed telemetry. Events are pseudonymous (distinctId = installId),
 * GeoIP is disabled, and person profiles are suppressed. posthog-node is loaded
 * lazily via dynamic import() so it never enters the test/CI module graph.
 */
export class PostHogTelemetry implements Telemetry {
  readonly kind = 'posthog' as const
  private readonly apiKey: string
  private readonly host: string | undefined
  private readonly installId: string
  private client: PostHogClientLike | null
  private loading: Promise<PostHogClientLike> | null = null

  constructor(opts: PostHogTelemetryOptions) {
    this.apiKey = opts.apiKey
    this.host = opts.host
    this.installId = opts.installId
    this.client = opts.client ?? null
  }

  track(event: TelemetryEventName | string, props?: TelemetryProps): void {
    void this.withClient((client) => {
      client.capture({
        distinctId: this.installId,
        event,
        properties: { ...props, ...ANON_PROPS },
        disableGeoip: true
      })
    })
  }

  captureError(err: unknown, context?: TelemetryProps): void {
    const scrubbed = scrubError(err)
    void this.withClient((client) => {
      client.capture({
        distinctId: this.installId,
        event: '$exception',
        properties: {
          ...context,
          $exception_message: scrubbed.message,
          $exception_type: scrubbed.name,
          $exception_stack: scrubbed.stack,
          ...ANON_PROPS
        },
        disableGeoip: true
      })
    })
  }

  async shutdown(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.shutdown()
    } catch (err) {
      logger.warn('Telemetry shutdown failed', err)
    }
  }

  /** Resolve the client (lazily importing posthog-node if none was injected), then run `fn`. */
  private async withClient(fn: (client: PostHogClientLike) => void): Promise<void> {
    try {
      const client = await this.ensureClient()
      fn(client)
    } catch (err) {
      // Telemetry must never break the app — swallow and log.
      logger.warn('Telemetry dispatch failed', err)
    }
  }

  private async ensureClient(): Promise<PostHogClientLike> {
    if (this.client) return this.client
    if (!this.loading) {
      this.loading = this.loadClient()
    }
    this.client = await this.loading
    return this.client
  }

  private async loadClient(): Promise<PostHogClientLike> {
    // Dynamic import keeps posthog-node out of the test/CI module graph.
    const { PostHog } = await import('posthog-node')
    const client = new PostHog(this.apiKey, {
      ...(this.host !== undefined && { host: this.host }),
      // Suppress GeoIP enrichment on every event by default.
      disableGeoip: true
    })
    return client as unknown as PostHogClientLike
  }
}
