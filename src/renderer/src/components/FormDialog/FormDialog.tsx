import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  FORM_DIALOG_CONTRACT,
  FORM_DIALOG_DEFAULTS,
  type FormDialogContractProps
} from './FormDialog.types'
import { formDialogVariants } from './FormDialog.variants'

export interface FormDialogProps extends FormDialogContractProps {
  className?: string
}

/**
 * FormDialog — Small dialog with Field(s) and a submit; validation inline, server errors in a Banner.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1456
 */
export function FormDialog({ className, ...rest }: FormDialogProps) {
  const props = { ...FORM_DIALOG_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="FormDialog" on the root element.
  return (
    <ScaffoldStub
      contract={FORM_DIALOG_CONTRACT}
      props={props}
      className={cn(formDialogVariants({ state: props.state }), className)}
    />
  )
}
