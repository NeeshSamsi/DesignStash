import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { SIDEBAR_NAV_ITEM_DEFAULTS, type SidebarNavItemContractProps } from './SidebarNavItem.types'
import { sidebarNavItemVariants } from './SidebarNavItem.variants'

export interface SidebarNavItemProps
  extends
    SidebarNavItemContractProps,
    Omit<ComponentProps<'button'>, keyof SidebarNavItemContractProps> {}

/**
 * SidebarNavItem — Nav row (icon · label · count); child rows hang off a TreeBranch.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1828
 * A button that fills its row. The icon is the same 16px whether or not the row is active.
 */
export function SidebarNavItem({ className, ...rest }: SidebarNavItemProps) {
  const { variant, active, showCount, showIcon, label, count, icon, ...props } = {
    ...SIDEBAR_NAV_ITEM_DEFAULTS,
    ...rest
  }
  return (
    <button
      type="button"
      data-ds="SidebarNavItem"
      data-variant={variant}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(sidebarNavItemVariants({ variant, active }), className)}
      {...props}
    >
      {showIcon && <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate type-body-sm-regular">{label}</span>
      {showCount && <span className="shrink-0 type-caption-xs-regular">{count}</span>}
    </button>
  )
}
