import { describe, it, expect } from 'vitest'
import { recommendTier, detectHardware } from './hardware'
import type { HardwareInfo } from './hardware'

describe('recommendTier', () => {
  it('should recommend "medium" for less than 16GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 8, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('medium')
  })

  it('should recommend "medium" for just under 16GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 15.9, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('medium')
  })

  it('should recommend "medium" for 16GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 16, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('medium')
  })

  it('should recommend "medium" for memory between 16GB and 32GB', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 24, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('medium')
  })

  it('should recommend "medium" for just under 32GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 31.9, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('medium')
  })

  it('should recommend "large" for 32GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 32, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('large')
  })

  it('should recommend "large" for more than 32GB memory', () => {
    const hw: HardwareInfo = { chip: 'test', totalMemoryGB: 64, isAppleSilicon: false }
    expect(recommendTier(hw)).toBe('large')
  })
})

describe('detectHardware', () => {
  it('should return plausible hardware info', () => {
    const hw = detectHardware()
    expect(hw.chip).not.toBe('Unknown')
    expect(hw.chip.length).toBeGreaterThan(0)
    expect(hw.totalMemoryGB).toBeGreaterThan(0)
    expect(typeof hw.isAppleSilicon).toBe('boolean')
  })
})
