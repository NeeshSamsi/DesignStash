import { describe, expect, it } from 'vitest'
import { POINT_MENU_WIDTH, pointMenuAlign } from './point-menu'

describe('pointMenuAlign', () => {
  it('opens to the right of the pointer while the menu fits', () => {
    expect(pointMenuAlign(100, 1280)).toBe('start')
    expect(pointMenuAlign(1280 - POINT_MENU_WIDTH, 1280)).toBe('start')
  })

  it('flips to the left of the pointer near the window’s right edge, as macOS does', () => {
    expect(pointMenuAlign(1280 - POINT_MENU_WIDTH + 1, 1280)).toBe('end')
    expect(pointMenuAlign(1134, 1280)).toBe('end')
  })

  it('keeps opening right in a window too narrow for either side', () => {
    expect(pointMenuAlign(100, 200)).toBe('start')
  })
})
