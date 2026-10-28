import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/Button'
import { dialogDescriptionClass, dialogPanelClass, dialogTitleClass } from '@renderer/ui/dialog'
import { DIALOG_DEFAULTS, type DialogContractProps } from './Dialog.types'
import { dialogVariants } from './Dialog.variants'

export interface DialogProps extends DialogContractProps {
  className?: string
}

/**
 * Dialog — Overlay shells. Screens never use these directly — they use Modal / ConfirmDialog / ChoiceDialog.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=213-781
 * Adapter over ui/dialog.tsx and ui/alert-dialog.tsx: this renders the static shell
 * (catalog, Figma parity); the live overlays are the ui/ primitives.
 */
export function Dialog({ className, ...rest }: DialogProps) {
  const props = { ...DIALOG_DEFAULTS, ...rest }
  const isAlert = props.variant === 'alert-dialog'
  return (
    <div
      data-ds="Dialog"
      data-variant={props.variant}
      className={cn(dialogPanelClass, dialogVariants({ variant: props.variant }), className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={dialogTitleClass}>{props.title}</p>
          {props.showDescription && <p className={dialogDescriptionClass}>{props.description}</p>}
        </div>
        {!isAlert && (
          <Button variant="ghost" size="icon" aria-label="Close" iconStart={Cancel01Icon} />
        )}
      </div>
      {!isAlert && (
        <div
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle px-4 py-10',
            props.variant === 'sheet' && 'flex-1'
          )}
        >
          <p className="type-caption-xs-regular text-tertiary">Content slot</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost">Cancel</Button>
        <Button variant={isAlert ? 'destructive' : 'primary'}>
          {isAlert ? 'Move to Trash' : 'Confirm'}
        </Button>
      </div>
    </div>
  )
}
