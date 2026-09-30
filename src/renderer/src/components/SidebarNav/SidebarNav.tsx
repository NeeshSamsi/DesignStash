import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  SIDEBAR_NAV_CONTRACT,
  SIDEBAR_NAV_DEFAULTS,
  type SidebarNavContractProps
} from './SidebarNav.types'
import { sidebarNavVariants } from './SidebarNav.variants'

export interface SidebarNavProps extends SidebarNavContractProps {
  className?: string
}

/**
 * SidebarNav — Primary navigation: AddMenu, Library › Starred / All on TreeBranch, To review (with-pending), Trash, Settings.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-1964
 * Today: AppShell.tsx
 */
export function SidebarNav({ className, ...rest }: SidebarNavProps) {
  const props = { ...SIDEBAR_NAV_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="SidebarNav" on the root element.
  return (
    <ScaffoldStub
      contract={SIDEBAR_NAV_CONTRACT}
      props={props}
      className={cn(sidebarNavVariants({ variant: props.variant }), className)}
    />
  )
}
