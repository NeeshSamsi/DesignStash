import { describe, it, expect } from 'vitest'
import { EntitlementsService } from './entitlements-service'
import { FEATURE_KEYS, type FeatureKey, type Tier } from '@shared/entitlements'

const STUB_REGISTRY = {
  'app.core': 'free',
  'search.semantic': 'pro'
} as unknown as Record<FeatureKey, Tier>

describe('EntitlementsService — stub registry', () => {
  it('free tier: unlocks free keys, locks pro keys', () => {
    const svc = new EntitlementsService({ getTier: () => 'free', registry: STUB_REGISTRY })
    expect(svc.isEnabled('app.core')).toBe(true)
    expect(svc.isEnabled('search.semantic')).toBe(false)
  })

  it('pro tier: unlocks all keys', () => {
    const svc = new EntitlementsService({ getTier: () => 'pro', registry: STUB_REGISTRY })
    expect(svc.isEnabled('app.core')).toBe(true)
    expect(svc.isEnabled('search.semantic')).toBe(true)
  })
})

describe('EntitlementsService — snapshot()', () => {
  it('returns tier and enabled map covering every FEATURE_KEYS entry', () => {
    const svc = new EntitlementsService({ getTier: () => 'free', registry: STUB_REGISTRY })
    const snap = svc.snapshot()
    expect(snap.tier).toBe('free')
    expect(typeof snap.enabled[FEATURE_KEYS.APP_CORE]).toBe('boolean')
    expect(typeof snap.enabled[FEATURE_KEYS.SEARCH_SEMANTIC]).toBe('boolean')
  })
})

describe('EntitlementsService — default Phase-1 (real registry)', () => {
  it('all keys unlocked at free tier with defaults', () => {
    const svc = new EntitlementsService()
    expect(svc.tier()).toBe('free')
    for (const key of Object.values(FEATURE_KEYS)) {
      expect(svc.isEnabled(key)).toBe(true)
    }
  })
})

describe('EntitlementsService — unknown key', () => {
  it('defaults unknown key to locked at free tier', () => {
    const svc = new EntitlementsService({ getTier: () => 'free' })
    expect(svc.isEnabled('unknown.key' as unknown as FeatureKey)).toBe(false)
  })
})
