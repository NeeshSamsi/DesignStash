import { describe, expect, it } from 'vitest'
import { MIN_WINDOW, initialWindowSize } from './window-size'

describe('initialWindowSize', () => {
  it('opens at 1440×900 on a roomy display', () => {
    expect(initialWindowSize({ width: 2560, height: 1415 })).toEqual({ width: 1440, height: 900 })
  })

  it('clamps to 95% of the work area on a smaller display', () => {
    // A 13" MacBook Air: 1440×900 screen, about 1440×875 usable.
    expect(initialWindowSize({ width: 1440, height: 875 })).toEqual({ width: 1368, height: 831 })
  })

  it('never opens below the minimum size', () => {
    expect(initialWindowSize({ width: 800, height: 500 })).toEqual(MIN_WINDOW)
  })

  it('rounds down to whole pixels', () => {
    const size = initialWindowSize({ width: 1501, height: 901 })
    expect(Number.isInteger(size.width)).toBe(true)
    expect(Number.isInteger(size.height)).toBe(true)
  })

  it('keeps the minimum at 1088×680', () => {
    expect(MIN_WINDOW).toEqual({ width: 1088, height: 680 })
  })
})
