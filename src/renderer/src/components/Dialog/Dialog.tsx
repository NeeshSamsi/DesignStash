import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { DIALOG_CONTRACT, DIALOG_DEFAULTS, type DialogContractProps } from './Dialog.types'
import { dialogVariants } from './Dialog.variants'

export interface DialogProps extends DialogContractProps {
  className?: string
}

/**
 * Dialog — Overlay shells. Screens never use these directly — they use Modal / ConfirmDialog / ChoiceDialog.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-781
 * Today: ui/dialog.tsx, ui/alert-dialog.tsx, ui/sheet.tsx
 */
export function Dialog({ className, ...rest }: DialogProps) {
  const props = { ...DIALOG_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Dialog" on the root element.
  return (
    <ScaffoldStub
      contract={DIALOG_CONTRACT}
      props={props}
      className={cn(dialogVariants({ variant: props.variant }), className)}
    />
  )
}
