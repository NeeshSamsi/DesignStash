import { describe, it, expect, vi } from 'vitest'
import { PostHogTelemetry, type PostHogClientLike } from './posthog-telemetry'

interface CaptureCall {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
  disableGeoip?: boolean
}

function makeFakeClient(): { client: PostHogClientLike; calls: CaptureCall[]; shutdown: ReturnType<typeof vi.fn> } {
  const calls: CaptureCall[] = []
  const shutdown = vi.fn(async () => {})
  const client: PostHogClientLike = {
    capture: (args) => {
      calls.push(args)
    },
    shutdown
  }
  return { client, calls, shutdown }
}

describe('PostHogTelemetry with an injected fake client (no network)', () => {
  it('track sends distinctId=installId, event name, and props', async () => {
    const { client, calls } = makeFakeClient()
    const t = new PostHogTelemetry({ apiKey: 'phc_test', installId: 'install-123', client })
    t.track('import_started', { count: 3 })
    // track dispatches asynchronously; let microtasks flush.
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.distinctId).toBe('install-123')
    expect(call.event).toBe('import_started')
    expect(call.properties).toMatchObject({ count: 3 })
    expect(call.disableGeoip).toBe(true)
    // Anonymous / personless capture.
    expect(call.properties?.$process_person_profile).toBe(false)
  })

  it('captureError scrubs absolute paths from the payload', async () => {
    const { client, calls } = makeFakeClient()
    const t = new PostHogTelemetry({ apiKey: 'phc_test', installId: 'install-123', client })
    t.captureError(new Error('boom at /Users/neesh/x'))
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.event).toBe('$exception')
    const serialized = JSON.stringify(call.properties)
    expect(serialized).not.toContain('/Users/neesh')
    expect(call.properties?.$exception_message).toContain('<path>')
  })

  it('shutdown flushes the client', async () => {
    const { client, shutdown } = makeFakeClient()
    const t = new PostHogTelemetry({ apiKey: 'phc_test', installId: 'install-123', client })
    await t.shutdown()
    expect(shutdown).toHaveBeenCalledOnce()
  })
})
