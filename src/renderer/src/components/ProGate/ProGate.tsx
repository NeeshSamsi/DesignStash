import type { ComponentProps, ReactNode } from 'react'
import { SquareLock02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { PRO_GATE_DEFAULTS, type ProGateContractProps } from './ProGate.types'
import {
  proGateBodyVariants,
  proGateIconVariants,
  proGateTitleVariants,
  proGateVariants
} from './ProGate.variants'

export interface ProGateProps
  extends ProGateContractProps, Omit<ComponentProps<'div'>, keyof ProGateContractProps | 'title'> {
  /** The Pro feature. Rendered as is when unlocked; Phase 1 unlocks everything, so the gate is dormant. */
  children?: ReactNode
  /** What the locked state says the feature is. */
  title?: string
  /** One line on what the feature does. */
  description?: string
  upgradeLabel?: string
  onUpgrade?: () => void
}

/**
 * ProGate — Wraps a Pro feature. Unlocked renders the child (all features are unlocked in Phase 1, so this is a dormant seam); locked shows a lock, a plain Pro tag, one line on what the feature does, and Upgrade.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-6940
 * No crown (the crown means Top) and no Learn more, since there is nowhere to learn more yet.
 * `inline` sits in a panel; `page` fills the content area.
 */
export function ProGate({
  className,
  children,
  title = 'Semantic search is a Pro feature',
  description = 'Find mockups by what’s in them, like “clay phone on a beach”, not just by title.',
  upgradeLabel = 'Upgrade',
  onUpgrade,
  ...rest
}: ProGateProps) {
  const { variant, unlocked, ...props } = { ...PRO_GATE_DEFAULTS, ...rest }
  const locked = !unlocked
  return (
    <div
      data-ds="ProGate"
      data-variant={variant}
      data-state={locked ? 'locked' : 'unlocked'}
      className={cn(proGateVariants({ variant, locked }), className)}
      {...props}
    >
      {locked ? (
        <>
          <div className={proGateIconVariants({ variant })}>
            <HugeiconsIcon icon={SquareLock02Icon} strokeWidth={1.5} aria-hidden />
          </div>
          <Badge>Pro</Badge>
          <p className={proGateTitleVariants({ variant })}>{title}</p>
          <p className={proGateBodyVariants({ variant })}>{description}</p>
          <Button variant="primary" size="sm" label={upgradeLabel} onClick={onUpgrade} />
        </>
      ) : (
        children
      )}
    </div>
  )
}
