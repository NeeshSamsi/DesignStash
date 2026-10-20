import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { ACTION_BAR_DEFAULTS, type ActionBarContractProps } from './ActionBar.types'
import { actionBarVariants } from './ActionBar.variants'

export interface ActionBarProps extends ActionBarContractProps {
  /** `modal`: left-hand text action, e.g. “Open in Photoshop”. Hidden unless given. */
  startLabel?: string
  onStart?: () => void
  /** `modal` / `page`: the secondary button. Defaults to Cancel; null hides it. */
  cancelLabel?: string | null
  onCancel?: () => void
  cancelDisabled?: boolean
  /** The one filled button. Say what it acts on (“Restore 3”). Null hides it. */
  primaryLabel?: string | null
  onPrimary?: () => void
  primaryDisabled?: boolean
  /** Shown in a Tooltip when the primary is disabled, so it never fails silently. */
  primaryDisabledReason?: string
  /** `stepper` labels. */
  backLabel?: string
  onBack?: () => void
  skipLabel?: string | null
  onSkip?: () => void
  finishLaterLabel?: string | null
  onFinishLater?: () => void
  pileShortcutLabel?: string
  onPileShortcut?: () => void
  className?: string
}

const DEFAULT_PRIMARY = { modal: 'Save', stepper: 'Stash & next', page: 'Continue' } as const

/**
 * ActionBar — Footer row: secondary actions left, primary right, optional status text.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-951
 * At most one filled button; everything else is the standard secondary or a ghost text button.
 */
export function ActionBar({
  className,
  startLabel,
  onStart,
  cancelLabel = 'Cancel',
  onCancel,
  cancelDisabled = false,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryDisabledReason,
  backLabel = 'Back',
  onBack,
  skipLabel = 'Skip for now',
  onSkip,
  finishLaterLabel = 'Finish later',
  onFinishLater,
  pileShortcutLabel = 'Stash the other 3 too',
  onPileShortcut,
  ...rest
}: ActionBarProps) {
  const props = { ...ACTION_BAR_DEFAULTS, ...rest }
  const isStepper = props.variant === 'stepper'
  const primary = primaryLabel === undefined ? DEFAULT_PRIMARY[props.variant] : primaryLabel

  const primaryButton = primary !== null && (
    <Button size="sm" disabled={primaryDisabled} onClick={onPrimary}>
      {primary}
    </Button>
  )

  return (
    <div
      data-ds="ActionBar"
      data-variant={props.variant}
      className={cn(actionBarVariants({ variant: props.variant }), className)}
    >
      {props.variant === 'modal' && startLabel && (
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="sm" onClick={onStart}>
            {startLabel}
          </Button>
        </div>
      )}
      {isStepper && (
        <div className="flex items-start gap-2">
          <Button variant="secondary" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
          {skipLabel && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              {skipLabel}
            </Button>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        {props.showStatus && (
          <p className="type-caption-xs-regular min-w-0 flex-1 text-tertiary">{props.status}</p>
        )}
        {isStepper ? (
          <>
            {finishLaterLabel && (
              <Button variant="secondary" size="sm" onClick={onFinishLater}>
                {finishLaterLabel}
              </Button>
            )}
            {props.showPileShortcut && (
              <Button variant="secondary" size="sm" onClick={onPileShortcut}>
                {pileShortcutLabel}
              </Button>
            )}
          </>
        ) : (
          cancelLabel && (
            <Button variant="secondary" size="sm" disabled={cancelDisabled} onClick={onCancel}>
              {cancelLabel}
            </Button>
          )
        )}
        {primaryButton &&
          (primaryDisabled && primaryDisabledReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{primaryButton}</span>
              </TooltipTrigger>
              <TooltipContent>{primaryDisabledReason}</TooltipContent>
            </Tooltip>
          ) : (
            primaryButton
          ))}
      </div>
    </div>
  )
}
