import { DialogCancel, DialogFrame, DialogHeading } from '@renderer/lib/dialog-shell'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/Button'
import { CHOICE_DIALOG_DEFAULTS, type ChoiceDialogContractProps } from './ChoiceDialog.types'
import { choiceDialogVariants } from './ChoiceDialog.variants'

export interface ChoiceDialogProps extends ChoiceDialogContractProps {
  /** Live alert dialog when given; without it the panel renders in place (catalog). */
  open?: boolean
  /** Left, ghost: the way out (Cancel, Resume, Later). Esc and outside press call it. Focused first. */
  tertiaryLabel?: string
  onTertiary?: () => void
  /** Middle, secondary: “Point only”. `null` leaves it out, for a plain two-way choice. */
  secondaryLabel?: string | null
  onSecondary?: () => void
  /** Right, the one filled button: “Move files”. Red when `destructive` (e.g. Discard). */
  primaryLabel?: string
  onPrimary?: () => void
  destructive?: boolean
  className?: string
}

/**
 * ChoiceDialog — Three-way decision: tertiary (left) · secondary · primary.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=216-1145
 * Exactly one filled button. The tertiary action is focused first and bound to Esc, so Enter
 * never triggers the primary (or a destructive one) unless focus has been moved to it.
 * Two-way decisions use ConfirmDialog.
 */
export function ChoiceDialog({
  className,
  open,
  tertiaryLabel = 'Cancel',
  onTertiary,
  secondaryLabel = 'Point only',
  onSecondary,
  primaryLabel = 'Move files',
  onPrimary,
  destructive = false,
  ...rest
}: ChoiceDialogProps) {
  const props = { ...CHOICE_DIALOG_DEFAULTS, ...rest }
  const tertiary =
    open !== undefined ? (
      <DialogCancel>
        <Button variant="ghost" size="sm">
          {tertiaryLabel}
        </Button>
      </DialogCancel>
    ) : (
      <Button variant="ghost" size="sm" onClick={onTertiary}>
        {tertiaryLabel}
      </Button>
    )

  return (
    <DialogFrame
      open={open}
      alert
      dataDs="ChoiceDialog"
      className={cn(choiceDialogVariants(), className)}
      onDismiss={onTertiary}
    >
      <DialogHeading title={props.title} description={props.description} />
      <div className="flex items-center justify-between">
        {tertiary}
        <div className="flex items-start gap-2">
          {secondaryLabel !== null && props.showSecondary && (
            <Button variant="secondary" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
          <Button variant={destructive ? 'destructive' : 'primary'} size="sm" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </DialogFrame>
  )
}
