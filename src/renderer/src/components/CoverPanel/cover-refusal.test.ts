import { describe, expect, it } from 'vitest'
import { coverRefusal } from './cover-refusal'

describe('coverRefusal: why main kept the cover', () => {
  it('says the PSD’s own preview is only the kit’s notice', () => {
    expect(coverRefusal('placeholder')).toBe(
      'The PSD’s own preview is only the kit’s “Delete this layer” notice, so this cover stays.'
    )
  })

  it('says the PSD has no preview of its own', () => {
    expect(coverRefusal('no-embedded')).toBe(
      'This PSD has no preview of its own, so this cover stays.'
    )
  })

  it('leaves a problem with a chosen file to the usual message', () => {
    for (const reason of ['not-image', 'too-large', 'unreadable'] as const) {
      expect(coverRefusal(reason)).toBeUndefined()
    }
  })
})
