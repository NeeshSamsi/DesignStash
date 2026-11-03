import { describe, expect, it } from 'vitest'
import { containerTransition } from './panel-motion'

describe('containerTransition', () => {
  it('opens in 280ms and widens again in 180ms, both on the out curve', () => {
    const open = containerTransition('width', true, false)
    const close = containerTransition('width', false, false)
    expect(open.transitionDuration).toBe('var(--duration-panel-open)')
    expect(close.transitionDuration).toBe('var(--duration-panel-container-close)')
    expect(open.transitionTimingFunction).toBe('var(--ease-panel-out)')
    expect(close.transitionTimingFunction).toBe('var(--ease-panel-out)')
  })

  it('does not animate with reduced motion', () => {
    expect(containerTransition('width', true, true)).toEqual({})
  })
})
