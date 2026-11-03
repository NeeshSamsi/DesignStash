import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  ERROR_STATE_CONTRACT,
  ERROR_STATE_DEFAULTS,
  type ErrorStateContractProps
} from './ErrorState.types'
import { errorStateVariants } from './ErrorState.variants'

export interface ErrorStateProps extends ErrorStateContractProps {
  className?: string
}

/**
 * ErrorState — What failed, why, and what to do; every IPC {code, message} surfaces here or in a Toast.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-666
 * Today: _legacy/States.tsx
 */
export function ErrorState({ className, ...rest }: ErrorStateProps) {
  const props = { ...ERROR_STATE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ErrorState" on the root element.
  return (
    <ScaffoldStub
      contract={ERROR_STATE_CONTRACT}
      props={props}
      className={cn(errorStateVariants({ variant: props.variant }), className)}
    />
  )
}
