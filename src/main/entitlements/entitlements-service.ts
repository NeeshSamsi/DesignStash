import {
  type Tier,
  type FeatureKey,
  type EntitlementsSnapshot,
  FEATURE_REQUIRED_TIER,
  FEATURE_KEYS,
  tierRank
} from '@shared/entitlements'

export interface EntitlementsDeps {
  /** Current tier source. PHASE 1 default: () => 'free' — everything still unlocks because the
   *  registry maps all keys to 'free'. Swap this for a license-backed source later. */
  getTier: () => Tier
  registry: Record<FeatureKey, Tier>
}

export class EntitlementsService {
  private getTier: () => Tier
  private registry: Record<FeatureKey, Tier>
  constructor(deps: Partial<EntitlementsDeps> = {}) {
    this.getTier = deps.getTier ?? (() => 'free')
    this.registry = deps.registry ?? FEATURE_REQUIRED_TIER
  }
  tier(): Tier { return this.getTier() }
  isEnabled(key: FeatureKey): boolean {
    const required = this.registry[key] ?? 'pro'   // unknown key defaults to locked
    return tierRank(this.getTier()) >= tierRank(required)
  }
  snapshot(): EntitlementsSnapshot {
    const enabled: Record<string, boolean> = {}
    for (const key of Object.values(FEATURE_KEYS)) enabled[key] = this.isEnabled(key)
    return { tier: this.getTier(), enabled }
  }
}
