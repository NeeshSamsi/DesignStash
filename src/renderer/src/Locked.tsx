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
    <div className="rounded border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      This is a Pro feature
    </div>
  )
}
