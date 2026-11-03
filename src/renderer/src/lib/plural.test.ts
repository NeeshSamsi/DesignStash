import { describe, expect, it } from 'vitest'
import { formatCount, mockups, pluralise } from './plural'

describe('mockups', () => {
  it('counts with a thousands separator, and one mockup is singular', () => {
    expect(mockups(1204)).toBe('1,204 mockups')
    expect(mockups(1)).toBe('1 mockup')
    expect(mockups(0)).toBe('0 mockups')
  })
})

describe('pluralise', () => {
  it('adds an s, or takes the plural it is given when the word changes', () => {
    expect(pluralise(1, 'item')).toBe('1 item')
    expect(pluralise(3, 'item')).toBe('3 items')
    expect(pluralise(2, 'PSD turned', 'PSDs turned')).toBe('2 PSDs turned')
    expect(pluralise(12_000, 'pile or mockup', 'piles and mockups')).toBe('12,000 piles and mockups')
  })

  it('formats a bare count the same way', () => {
    expect(formatCount(1204)).toBe('1,204')
    expect(formatCount(7)).toBe('7')
  })
})
