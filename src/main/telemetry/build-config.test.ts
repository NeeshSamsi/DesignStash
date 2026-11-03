import { describe, expect, it } from 'vitest'
import { DEFAULT_POSTHOG_HOST, telemetryBuildConfig } from './build-config'

describe('telemetryBuildConfig', () => {
  it('has no key and the US host when nothing was baked in (dev and tests)', () => {
    expect(telemetryBuildConfig()).toEqual({ apiKey: undefined, host: DEFAULT_POSTHOG_HOST })
  })
})
