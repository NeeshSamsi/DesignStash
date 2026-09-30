import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { SPINNER_CONTRACT, SPINNER_DEFAULTS, type SpinnerContractProps } from './Spinner.types'
import { spinnerVariants } from './Spinner.variants'

export interface SpinnerProps extends SpinnerContractProps {
  className?: string
}

/**
 * Spinner — Indeterminate activity for short waits (Hugeicons loading-03, rotated in code).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-32
 * Today: ui/spinner.tsx
 */
export function Spinner({ className, ...rest }: SpinnerProps) {
  const props = { ...SPINNER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Spinner" on the root element.
  return (
    <ScaffoldStub
      contract={SPINNER_CONTRACT}
      props={props}
      className={cn(spinnerVariants({ size: props.size }), className)}
    />
  )
}
