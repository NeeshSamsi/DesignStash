import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SIDEBAR_NAV_ITEM_CONTRACT,
  SIDEBAR_NAV_ITEM_DEFAULTS,
  type SidebarNavItemContractProps
} from './SidebarNavItem.types'
import { sidebarNavItemVariants } from './SidebarNavItem.variants'

export interface SidebarNavItemProps extends SidebarNavItemContractProps {
  className?: string
}

/**
 * SidebarNavItem — Nav row (icon · label · count); child rows hang off a TreeBranch.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1828
 * Today: AppShell.tsx
 */
export function SidebarNavItem({ className, ...rest }: SidebarNavItemProps) {
  const props = { ...SIDEBAR_NAV_ITEM_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SidebarNavItem" on the root element.
  return (
    <ScaffoldStub
      contract={SIDEBAR_NAV_ITEM_CONTRACT}
      props={props}
      className={cn(
        sidebarNavItemVariants({ variant: props.variant, active: props.active }),
        className
      )}
    />
  )
}
