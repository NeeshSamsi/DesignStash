import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  CHOICE_DIALOG_CONTRACT,
  CHOICE_DIALOG_DEFAULTS,
  type ChoiceDialogContractProps
} from './ChoiceDialog.types'
import { choiceDialogVariants } from './ChoiceDialog.variants'

export interface ChoiceDialogProps extends ChoiceDialogContractProps {
  className?: string
}

/**
 * ChoiceDialog — Three-way decision: tertiary (left) · secondary · primary.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1145
 */
export function ChoiceDialog({ className, ...rest }: ChoiceDialogProps) {
  const props = { ...CHOICE_DIALOG_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="ChoiceDialog" on the root element.
  return (
    <ScaffoldStub
      contract={CHOICE_DIALOG_CONTRACT}
      props={props}
      className={cn(choiceDialogVariants({ variant: props.variant }), className)}
    />
  )
}
