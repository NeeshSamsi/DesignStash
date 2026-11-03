import { ICON_STROKE } from '@renderer/design-system/icon'
import { useState, type ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiMagicIcon,
  Alert02Icon,
  Cancel01Icon,
  InformationCircleIcon
} from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { Spinner } from '@renderer/components/Spinner'
import { cn } from '@renderer/lib/utils'
import { AI_STATUS_DEFAULTS, type AiStatusContractProps, type AiStatusKind } from './AiStatus.types'
import { aiStatusIconVariants, aiStatusVariants } from './AiStatus.variants'

export interface AiStatusProps
  extends AiStatusContractProps, Omit<ComponentProps<'div'>, keyof AiStatusContractProps> {
  /** The ×, when `dismissible`. */
  onDismiss?: () => void
}

type Shown = Exclude<AiStatusKind, 'none'>

/** Figma's sample action per kind, until one is given (catalog). */
const SAMPLE_ACTION: Record<Shown, { label: string; ghost: boolean }> = {
  working: { label: 'Fill it myself', ghost: true },
  done: { label: 'Undo', ghost: false },
  off: { label: 'Apply here', ghost: false },
  failed: { label: 'Try again', ghost: false }
}

function Icon({ kind }: { kind: Shown }) {
  if (kind === 'working') {
    return (
      <span data-icon="spinner" className="inline-flex shrink-0 text-tertiary">
        <Spinner size="sm" />
      </span>
    )
  }
  const icon = { done: AiMagicIcon, off: InformationCircleIcon, failed: Alert02Icon }[kind]
  return (
    <HugeiconsIcon
      data-icon={kind}
      icon={icon}
      strokeWidth={ICON_STROKE}
      className={aiStatusIconVariants({ kind })}
    />
  )
}

/**
 * AiStatus — What the AI is doing for the mockup on screen in Look it over: one line above the
 * form, with up to two small actions (the lighter `secondary` on the left, `action` on the right)
 * and an optional ×. working: a spinner; done: a sparkle; off: info; failed: an alert in the
 * warning colour; none: the same row, empty, once a message has had its say.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=1075-201549
 * Rules: design/specs/look-over.md. The screen decides whether the row exists when a mockup opens
 * and never adds or removes it while it's on screen. Going to `none` fades the last message out and
 * takes its actions away at once.
 */
export function AiStatus({ className, onDismiss, ...rest }: AiStatusProps) {
  const { kind, showAction, secondaryAction, dismissible, message, secondary, action, ...props } = {
    ...AI_STATUS_DEFAULTS,
    ...rest
  }
  // What the row last said, so `none` can fade it out where it was.
  const [last, setLast] = useState<{ kind: Shown; message: string } | null>(null)
  if (kind !== 'none' && (last?.kind !== kind || last.message !== message)) {
    setLast({ kind, message })
  }
  const shown = kind === 'none' ? last : { kind, message }
  const live = kind !== 'none'
  const sample = live ? SAMPLE_ACTION[kind] : null

  return (
    <div
      data-ds="AiStatus"
      data-kind={kind}
      role="status"
      className={cn(aiStatusVariants({ kind }), className)}
      {...props}
    >
      {shown && (
        <div
          data-slot="ai-status-content"
          aria-hidden={live ? undefined : true}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-(--duration-slow) ease-out motion-reduce:transition-none',
            !live && 'opacity-0'
          )}
        >
          <Icon kind={shown.kind} />
          <p className="min-w-0 flex-1 truncate type-caption-xs-regular text-muted-foreground">
            {shown.message}
          </p>
        </div>
      )}
      {live && (
        <div className="flex shrink-0 items-center gap-2">
          {secondaryAction && secondary}
          {showAction &&
            (action ??
              (sample && (
                <Button
                  variant={sample.ghost ? 'ghost' : 'secondary'}
                  size="xs"
                  label={sample.label}
                />
              )))}
          {dismissible && (
            <Button
              variant="ghost"
              size="icon-xs"
              iconStart={Cancel01Icon}
              aria-label="Dismiss"
              onClick={onDismiss}
            />
          )}
        </div>
      )}
    </div>
  )
}
