import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  TABS_TRIGGER_CONTRACT,
  TABS_TRIGGER_DEFAULTS,
  type TabsTriggerContractProps
} from './TabsTrigger.types'
import { tabsTriggerVariants } from './TabsTrigger.variants'

export interface TabsTriggerProps extends TabsTriggerContractProps {
  className?: string
}

/**
 * TabsTrigger — Building block for Tabs.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-573
 * Today: TabsTrigger in ui/tabs.tsx
 */
export function TabsTrigger({ className, ...rest }: TabsTriggerProps) {
  const props = { ...TABS_TRIGGER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="TabsTrigger" on the root element.
  return (
    <ScaffoldStub
      contract={TABS_TRIGGER_CONTRACT}
      props={props}
      className={cn(
        tabsTriggerVariants({ variant: props.variant, active: props.active }),
        className
      )}
    />
  )
}
