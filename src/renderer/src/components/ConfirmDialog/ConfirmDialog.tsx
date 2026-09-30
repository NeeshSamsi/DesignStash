import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  CONFIRM_DIALOG_CONTRACT,
  CONFIRM_DIALOG_DEFAULTS,
  type ConfirmDialogContractProps
} from './ConfirmDialog.types'
import { confirmDialogVariants } from './ConfirmDialog.variants'

export interface ConfirmDialogProps extends ConfirmDialogContractProps {
  className?: string
}

/**
 * ConfirmDialog — Two-choice confirmation that names the consequence (item, count, size).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1010
 * Today: _legacy/ConfirmDialog.tsx
 */
export function ConfirmDialog({ className, ...rest }: ConfirmDialogProps) {
  const props = { ...CONFIRM_DIALOG_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ConfirmDialog" on the root element.
  return (
    <ScaffoldStub
      contract={CONFIRM_DIALOG_CONTRACT}
      props={props}
      className={cn(
        confirmDialogVariants({ variant: props.variant, working: props.working }),
        className
      )}
    />
  )
}
