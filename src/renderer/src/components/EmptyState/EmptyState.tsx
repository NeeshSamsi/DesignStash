import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  EMPTY_STATE_CONTRACT,
  EMPTY_STATE_DEFAULTS,
  type EmptyStateContractProps
} from './EmptyState.types'
import { emptyStateVariants } from './EmptyState.variants'

export interface EmptyStateProps extends EmptyStateContractProps {
  className?: string
}

/**
 * EmptyState — Zero-data / zero-result state with a required primary action.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-403
 * Today: _legacy/States.tsx
 */
export function EmptyState({ className, ...rest }: EmptyStateProps) {
  const props = { ...EMPTY_STATE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="EmptyState" on the root element.
  return (
    <ScaffoldStub
      contract={EMPTY_STATE_CONTRACT}
      props={props}
      className={cn(emptyStateVariants({ variant: props.variant }), className)}
    />
  )
}
