import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps, ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge as UiBadge } from '@renderer/ui/badge'
import { BADGE_DEFAULTS, type BadgeContractProps } from './Badge.types'

export interface BadgeProps
  extends BadgeContractProps, Omit<ComponentProps<'span'>, keyof BadgeContractProps> {
  /** Replaces `label` when the content is more than text. */
  children?: ReactNode
}

/**
 * Badge — Small status / count label; status variants use weak fills + coloured text.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-78
 * Styles live in ui/badge.tsx; this maps the Figma props onto it (primary → default).
 */
export function Badge({ children, ...rest }: BadgeProps) {
  const { variant, showIcon, label, icon, ...props } = { ...BADGE_DEFAULTS, ...rest }
  return (
    <UiBadge data-ds="Badge" variant={variant === 'primary' ? 'default' : variant} {...props}>
      {showIcon && <HugeiconsIcon icon={icon} strokeWidth={ICON_STROKE} />}
      {children ?? label}
    </UiBadge>
  )
}
