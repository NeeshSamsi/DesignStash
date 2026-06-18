import type { FeatureKey } from '@shared/entitlements'
import { useEntitlement } from './useEntitlement'

interface LockedProps {
  feature: FeatureKey
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function Locked({ feature, children, fallback }: LockedProps) {
  const enabled = useEntitlement(feature)
  if (enabled) return <>{children}</>
  if (fallback) return <>{fallback}</>
  return (
    <div className="px-3 py-2 rounded bg-neutral-800 border border-neutral-600 text-neutral-400 text-xs">
      This is a Pro feature
    </div>
  )
}
