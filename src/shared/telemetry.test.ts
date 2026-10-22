import { describe, expect, it } from 'vitest'
import { TELEMETRY_EVENTS, sizeBucket } from './telemetry'

describe('sizeBucket', () => {
  it('turns a count into a range', () => {
    expect([0, 1, 9, 10, 49, 50, 199, 200, 999, 1000, 20000].map(sizeBucket)).toEqual([
      '0', '1-9', '1-9', '10-49', '10-49', '50-199', '50-199', '200-999', '200-999', '1000+', '1000+'
    ])
  })
})

describe('TELEMETRY_EVENTS', () => {
  it('has no event for the retired mandatory upload', () => {
    expect(Object.values(TELEMETRY_EVENTS)).not.toContain('mandatory_upload_hit')
  })
})
