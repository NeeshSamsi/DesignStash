import { describe, it, expect } from 'vitest'
import { appInfoSchema } from './schemas'

describe('appInfoSchema', () => {
  it('accepts valid app info', () => {
    const parsed = appInfoSchema.parse({ name: 'DesignStash', version: '0.0.0' })
    expect(parsed).toEqual({ name: 'DesignStash', version: '0.0.0' })
  })

  it('rejects an empty name', () => {
    expect(() => appInfoSchema.parse({ name: '', version: '0.0.0' })).toThrow()
  })
})
