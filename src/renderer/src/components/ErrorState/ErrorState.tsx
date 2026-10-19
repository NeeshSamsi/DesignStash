import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Banner } from '@renderer/components/Banner'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/ui/button'
import { ERROR_STATE_DEFAULTS, type ErrorStateContractProps } from './ErrorState.types'
import { errorStateVariants } from './ErrorState.variants'

export interface ErrorStateProps extends ErrorStateContractProps {
  /** Primary action. Defaults to Retry (Reload on `full-window`). */
  retryLabel?: string
  onRetry?: () => void
  /** Second action on `page` / `full-window`, e.g. “Check your stash” or “Quit”. Pass null to hide it. */
  secondaryLabel?: string | null
  onSecondary?: () => void
  /** With `showDetails`: copies a technical report. The report never appears on screen. */
  onCopyReport?: () => void
  className?: string
}

const DEFAULT_RETRY = { inline: 'Retry', page: 'Retry', 'full-window': 'Reload' } as const
const DEFAULT_SECONDARY = { page: 'Check your stash', 'full-window': 'Quit' } as const

/**
 * ErrorState — What failed, why, and what to do.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-666
 * Plain language only: `code` is accepted for the contract but never rendered, and `showDetails`
 * (off by default) offers a Copy report button instead of printing codes, traces or paths.
 */
export function ErrorState({
  className,
  retryLabel,
  onRetry,
  secondaryLabel,
  onSecondary,
  onCopyReport,
  ...rest
}: ErrorStateProps) {
  // `props.code` is deliberately never read: nothing technical is shown.
  const props = { ...ERROR_STATE_DEFAULTS, showDetails: false, ...rest }
  const retry = retryLabel ?? DEFAULT_RETRY[props.variant]

  if (props.variant === 'inline') {
    return (
      <div data-ds="ErrorState" data-variant="inline" className={className}>
        <Banner
          tone="error"
          title={props.title}
          message={props.message}
          action
          actionLabel={retry}
          {...(onRetry ? { onAction: onRetry } : {})}
          dismissible={false}
        />
      </div>
    )
  }

  const secondary =
    secondaryLabel === undefined ? DEFAULT_SECONDARY[props.variant] : secondaryLabel
  const isFullWindow = props.variant === 'full-window'
  return (
    <div
      data-ds="ErrorState"
      data-variant={props.variant}
      role="alert"
      className={cn(errorStateVariants({ variant: props.variant }), className)}
    >
      <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-error-weak text-error">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-6" />
      </div>
      <p className={isFullWindow ? 'type-display-2xl-medium text-foreground' : 'type-title-lg-semibold text-foreground'}>
        {props.title}
      </p>
      <p className="type-body-sm-regular text-muted-foreground">{props.message}</p>
      <div className="flex items-start gap-2">
        <Button size="sm" onClick={onRetry}>
          {retry}
        </Button>
        {secondary && (
          <Button variant="secondary" size="sm" onClick={onSecondary}>
            {secondary}
          </Button>
        )}
      </div>
      {props.showDetails && (
        <div className="flex w-full items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
          <p className="type-caption-xs-regular min-w-0 flex-1 text-left text-tertiary">
            A report is ready to copy if you need to ask for help.
          </p>
          <Button variant="ghost" size="xs" onClick={onCopyReport}>
            Copy report
          </Button>
        </div>
      )}
    </div>
  )
}
