/**
 * The PostHog key and host, baked in at BUILD time by electron-vite's `define` (see
 * electron.vite.config.ts), never read from the runtime environment. A dev run, a test run and any
 * build made without POSTHOG_KEY get no key, so they stay Noop.
 */
declare const __POSTHOG_KEY__: string | undefined
declare const __POSTHOG_HOST__: string | undefined

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

export interface TelemetryBuildConfig {
  apiKey: string | undefined
  host: string
}

export function telemetryBuildConfig(): TelemetryBuildConfig {
  const key = typeof __POSTHOG_KEY__ === 'string' ? __POSTHOG_KEY__.trim() : ''
  const host = typeof __POSTHOG_HOST__ === 'string' ? __POSTHOG_HOST__.trim() : ''
  return { apiKey: key || undefined, host: host || DEFAULT_POSTHOG_HOST }
}
