import { create } from 'zustand'
import type { Tier, EntitlementsSnapshot } from '@shared/entitlements'

interface EntitlementState {
  tier: Tier
  enabled: Record<string, boolean>
  loaded: boolean
  setSnapshot(s: EntitlementsSnapshot): void
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  tier: 'free',
  enabled: {},
  loaded: false,
  setSnapshot(s) {
    set({ tier: s.tier, enabled: s.enabled, loaded: true })
  }
}))
