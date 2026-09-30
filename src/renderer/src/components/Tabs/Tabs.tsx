import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { TABS_CONTRACT, TABS_DEFAULTS, type TabsContractProps } from './Tabs.types'
import { tabsVariants } from './Tabs.variants'

export interface TabsProps extends TabsContractProps {
  className?: string
}

/**
 * Tabs — Settings section switcher.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-608
 * Today: ui/tabs.tsx
 */
export function Tabs({ className, ...rest }: TabsProps) {
  const props = { ...TABS_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Tabs" on the root element.
  return (
    <ScaffoldStub
      contract={TABS_CONTRACT}
      props={props}
      className={cn(tabsVariants({ variant: props.variant }), className)}
    />
  )
}
