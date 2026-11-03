import { beforeEach, describe, expect, it } from 'vitest'
import { useDetailEffects } from './detailEffectsStore'

beforeEach(() => useDetailEffects.setState({ revision: 0, pendingSelection: [] }))

describe('detail effects', () => {
  it('bumps the revision on every change', () => {
    useDetailEffects.getState().notifyChanged()
    useDetailEffects.getState().notifyChanged()
    expect(useDetailEffects.getState().revision).toBe(2)
  })

  it('hands the pending selection over once', () => {
    useDetailEffects.getState().selectAfterReload([4, 5])
    expect(useDetailEffects.getState().takePendingSelection()).toEqual([4, 5])
    expect(useDetailEffects.getState().takePendingSelection()).toEqual([])
  })
})
