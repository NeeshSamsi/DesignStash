import { describe, expect, it } from 'vitest'
import { DOCK_GAP, dockBottom } from './dock'

describe('dockBottom', () => {
  it('keeps the normal margin with no action bar', () => {
    expect(dockBottom(null, 680)).toBe(DOCK_GAP)
  })

  it('sits a gap above the top of a pinned action bar', () => {
    // A bar whose top is 72px from the bottom of a 680px window.
    expect(dockBottom(608, 680)).toBe(72 + DOCK_GAP)
  })

  it('never gets closer to the window edge than the gap', () => {
    expect(dockBottom(700, 680)).toBe(DOCK_GAP)
    expect(dockBottom(680, 680)).toBe(DOCK_GAP)
  })

  it('follows the window as it resizes', () => {
    expect(dockBottom(608, 680)).toBe(88)
    expect(dockBottom(808, 880)).toBe(88)
    expect(dockBottom(608, 900)).toBe(308)
  })
})
