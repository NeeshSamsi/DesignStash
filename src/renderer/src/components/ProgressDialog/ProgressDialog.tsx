import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  PROGRESS_DIALOG_CONTRACT,
  PROGRESS_DIALOG_DEFAULTS,
  type ProgressDialogContractProps
} from './ProgressDialog.types'
import { progressDialogVariants } from './ProgressDialog.variants'

export interface ProgressDialogProps extends ProgressDialogContractProps {
  className?: string
}

/**
 * ProgressDialog — Blocking long-running task with progress and cancel.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1602
 */
export function ProgressDialog({ className, ...rest }: ProgressDialogProps) {
  const props = { ...PROGRESS_DIALOG_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ProgressDialog" on the root element.
  return (
    <ScaffoldStub
      contract={PROGRESS_DIALOG_CONTRACT}
      props={props}
      className={cn(progressDialogVariants({ state: props.state }), className)}
    />
  )
}
