import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { PROGRESS_CONTRACT, PROGRESS_DEFAULTS, type ProgressContractProps } from './Progress.types'
import { progressVariants } from './Progress.variants'

export interface ProgressProps extends ProgressContractProps {
  className?: string
}

/**
 * Progress — Determinate / indeterminate bar. Indicator width = value in code.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-176
 * Today: ui/progress.tsx
 */
export function Progress({ className, ...rest }: ProgressProps) {
  const props = { ...PROGRESS_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Progress" on the root element.
  return (
    <ScaffoldStub
      contract={PROGRESS_CONTRACT}
      props={props}
      className={cn(progressVariants({ size: props.size, state: props.state }), className)}
    />
  )
}
