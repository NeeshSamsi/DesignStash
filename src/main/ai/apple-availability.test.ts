import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelperError, NativeHelper } from '../native/helper'
import type { HelperInfo } from '../native/helper-schemas'
import { createAppleAvailability } from './apple-availability'

const info = (available: boolean, reason?: string): HelperInfo => ({
  protocol: 1,
  os: '27.2.0',
  vision: {},
  foundationModels: { available, ...(reason ? { reason } : {}) },
  ms: 1
})

function stubHelper(answer: () => Promise<HelperInfo>) {
  return { info: vi.fn(answer) }
}

describe('createAppleAvailability', () => {
  let real: NativeHelper | null = null
  afterEach(async () => {
    await real?.stop()
    real = null
  })

  it('is available when the helper says the on-device model is ready', async () => {
    const helper = stubHelper(async () => info(true))
    await expect(createAppleAvailability({ helper }).available()).resolves.toBe(true)
  })

  it('is not available when Apple Intelligence is off or the Mac is below macOS 27', async () => {
    const off = stubHelper(async () => info(false, 'appleIntelligenceNotEnabled'))
    await expect(createAppleAvailability({ helper: off }).available()).resolves.toBe(false)
    const old = stubHelper(async () => info(false, 'notMacOS27'))
    await expect(createAppleAvailability({ helper: old }).available()).resolves.toBe(false)
  })

  it('is not available when there is no helper or it fails, and never throws', async () => {
    const missing = new NativeHelper({ binaryPath: null })
    await expect(createAppleAvailability({ helper: missing }).available()).resolves.toBe(false)
    const broken = stubHelper(async () => {
      throw new HelperError('crashed', 'gone')
    })
    await expect(createAppleAvailability({ helper: broken }).available()).resolves.toBe(false)
  })

  it('says why it is not available, and nothing when it is', async () => {
    const off = createAppleAvailability({ helper: stubHelper(async () => info(false, 'appleIntelligenceNotEnabled')) })
    await expect(off.status()).resolves.toEqual({ available: false, reason: 'appleIntelligenceNotEnabled' })
    const on = createAppleAvailability({ helper: stubHelper(async () => info(true)) })
    await expect(on.status()).resolves.toEqual({ available: true, reason: null })
    const broken = createAppleAvailability({
      helper: stubHelper(async () => {
        throw new HelperError('crashed', 'gone')
      })
    })
    await expect(broken.status()).resolves.toEqual({ available: false, reason: 'unknown' })
  })

  it('asks the helper once for a while, sharing one answer between callers', async () => {
    let now = 0
    const helper = stubHelper(async () => info(true))
    const apple = createAppleAvailability({ helper, ttlMs: 1000, now: () => now })
    await Promise.all([apple.available(), apple.status()])
    now = 999
    await apple.available()
    expect(helper.info).toHaveBeenCalledOnce()
    now = 1000
    await apple.available()
    expect(helper.info).toHaveBeenCalledTimes(2)
  })

  it('asks again a minute after an unavailable answer, since Apple Intelligence can come back on (H-1)', async () => {
    let now = 0
    const helper = stubHelper(async () => info(false, 'appleIntelligenceNotEnabled'))
    const apple = createAppleAvailability({ helper, now: () => now })
    await apple.available()
    now = 59_999
    await apple.available()
    expect(helper.info).toHaveBeenCalledOnce()
    now = 60_000
    await apple.available()
    expect(helper.info).toHaveBeenCalledTimes(2)
  })

  it('forgets its answer on refresh, so the next question asks the helper (H-1)', async () => {
    const helper = stubHelper(async () => info(true))
    const apple = createAppleAvailability({ helper })
    await apple.available()
    apple.refresh()
    await apple.available()
    expect(helper.info).toHaveBeenCalledTimes(2)
  })

  it('reads the real answer through the fake helper', async () => {
    real = new NativeHelper({
      binaryPath: process.execPath,
      args: [resolve('src/main/native/__fixtures__/fake-helper.mjs')]
    })
    await expect(createAppleAvailability({ helper: real }).available()).resolves.toBe(true)
  })
})
