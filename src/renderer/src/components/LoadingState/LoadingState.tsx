import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  LOADING_STATE_CONTRACT,
  LOADING_STATE_DEFAULTS,
  type LoadingStateContractProps
} from './LoadingState.types'
import { loadingStateVariants } from './LoadingState.variants'

export interface LoadingStateProps extends LoadingStateContractProps {
  className?: string
}

/**
 * LoadingState — Waiting states: spinner or content-shaped skeletons.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-476
 * Today: _legacy/States.tsx
 */
export function LoadingState({ className, ...rest }: LoadingStateProps) {
  const props = { ...LOADING_STATE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="LoadingState" on the root element.
  return (
    <ScaffoldStub
      contract={LOADING_STATE_CONTRACT}
      props={props}
      className={cn(loadingStateVariants({ variant: props.variant }), className)}
    />
  )
}
