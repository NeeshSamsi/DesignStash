import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ACTION_BAR_CONTRACT,
  ACTION_BAR_DEFAULTS,
  type ActionBarContractProps
} from './ActionBar.types'
import { actionBarVariants } from './ActionBar.variants'

export interface ActionBarProps extends ActionBarContractProps {
  className?: string
}

/**
 * ActionBar — Footer row: secondary actions left, primary right, optional status text.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-951
 */
export function ActionBar({ className, ...rest }: ActionBarProps) {
  const props = { ...ACTION_BAR_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ActionBar" on the root element.
  return (
    <ScaffoldStub
      contract={ACTION_BAR_CONTRACT}
      props={props}
      className={cn(actionBarVariants({ variant: props.variant }), className)}
    />
  )
}
