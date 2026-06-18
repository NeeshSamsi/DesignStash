import type { FeatureKey } from '@shared/entitlements'
import { useEntitlementStore } from './stores/entitlementStore'

export function useEntitlement(key: FeatureKey): boolean {
  return useEntitlementStore((s) => s.enabled[key] ?? false)
}
