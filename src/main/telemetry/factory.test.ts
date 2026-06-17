import { describe, it, expect } from 'vitest'
import { createTelemetry } from './factory'
import { NoopTelemetry } from './telemetry'
import { PostHogTelemetry } from './posthog-telemetry'

const base = {
  enabled: true,
  isProd: true,
  isTest: false,
  installId: 'install-123',
  apiKey: 'phc_test'
}

describe('createTelemetry decision point', () => {
  it('returns Noop under test env', () => {
    expect(createTelemetry({ ...base, isTest: true })).toBeInstanceOf(NoopTelemetry)
  })

  it('returns Noop in dev (!isProd)', () => {
    expect(createTelemetry({ ...base, isProd: false })).toBeInstanceOf(NoopTelemetry)
  })

  it('returns Noop when consent disabled', () => {
    expect(createTelemetry({ ...base, enabled: false })).toBeInstanceOf(NoopTelemetry)
  })

  it('returns Noop when apiKey missing', () => {
    expect(createTelemetry({ ...base, apiKey: undefined })).toBeInstanceOf(NoopTelemetry)
  })

  it('returns PostHogTelemetry only when enabled + prod + apiKey present', () => {
    expect(createTelemetry(base)).toBeInstanceOf(PostHogTelemetry)
  })
})
