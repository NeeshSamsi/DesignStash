import { describe, it, expect, vi } from 'vitest'
import { recommendTier, detectHardware } from './hardware'
import type { HardwareInfo } from './hardware'

const execSync = vi.hoisted(() => vi.fn<(command: string) => Buffer>(() => Buffer.from('Apple M3 Max\n')))
vi.mock('node:child_process', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:child_process')>()), execSync }))

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

  it('asks the system once a launch, so a window coming back runs no sysctl (F-055)', () => {
    const first = detectHardware()
    expect(detectHardware()).toBe(first)
    expect(detectHardware()).toBe(first)
    expect(execSync.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
