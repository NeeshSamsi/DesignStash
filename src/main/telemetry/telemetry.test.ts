import { describe, it, expect } from 'vitest'
import { NoopTelemetry, type Telemetry } from './telemetry'

describe('NoopTelemetry', () => {
  it('track does nothing and never throws', () => {
    const t: Telemetry = new NoopTelemetry()
    expect(() => t.track('import_started', { count: 3 })).not.toThrow()
    expect(() => t.track('anything')).not.toThrow()
  })

  it('captureError does nothing and never throws', () => {
    const t: Telemetry = new NoopTelemetry()
    expect(() => t.captureError(new Error('boom'))).not.toThrow()
    expect(() => t.captureError('weird')).not.toThrow()
  })

  it('shutdown resolves', async () => {
    const t: Telemetry = new NoopTelemetry()
    await expect(t.shutdown()).resolves.toBeUndefined()
  })
})
