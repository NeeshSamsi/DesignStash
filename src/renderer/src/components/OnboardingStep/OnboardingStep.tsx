import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { ArrowLeft01Icon, ArrowRight01Icon, FolderLibraryIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/Button'
import { StepIndicator, type StepIndicatorProps } from '@renderer/components/StepIndicator'
import { cn } from '@renderer/lib/utils'
import { ONBOARDING_STEP_DEFAULTS, type OnboardingStepContractProps } from './OnboardingStep.types'
import { onboardingStepTitleVariants, onboardingStepVariants } from './OnboardingStep.variants'

export interface OnboardingStepProps
  extends
    OnboardingStepContractProps,
    Omit<ComponentProps<'div'>, keyof OnboardingStepContractProps | 'title' | 'children'> {
  /** Which of the five steps this is. Figma draws welcome as 1 and standard as 3. */
  step?: StepIndicatorProps['step']
  /** The primary button. Defaults to "Get started" on welcome and "Continue" on standard. */
  primaryLabel?: string
  /** The primary's label while `busy`, e.g. "Checking…" or "Starting download…". */
  busyLabel?: string
  /** Standard only. Leaves the primary out when the page's own buttons are the answer (privacy). */
  hidePrimary?: boolean
  /** The primary stays off until the page has what it needs (a usable folder). */
  primaryDisabled?: boolean
  /** Standard only. The quiet button next to the primary. */
  skipLabel?: string
  /** Standard only. Hidden when there is no handler. */
  onBack?: () => void
  /** Standard only. Hidden when there is no handler. */
  onSkip?: () => void
  onPrimary?: () => void
}

/**
 * OnboardingStep — One onboarding page inside CenteredLayout: StepIndicator, title, body, content slot, footer (Back · skip · primary). busy puts the primary in its loading state while a folder is checked or a download starts.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-4473
 * Welcome is the first page (icon tile, big title, Get started). Standard carries the content slot;
 * the placeholder Figma shows there never renders, so an empty slot leaves nothing behind.
 */
export function OnboardingStep({
  className,
  step,
  primaryLabel,
  busyLabel = 'Checking…',
  primaryDisabled = false,
  hidePrimary = false,
  skipLabel = 'Skip for now',
  onBack,
  onSkip,
  onPrimary,
  ...rest
}: OnboardingStepProps) {
  const { variant, busy, footer, showContent, title, body, content, ...props } = {
    ...ONBOARDING_STEP_DEFAULTS,
    ...rest
  }
  const welcome = variant === 'welcome'
  const label = primaryLabel ?? (welcome ? 'Get started' : 'Continue')
  return (
    <div
      data-ds="OnboardingStep"
      data-variant={variant}
      data-state={busy ? 'busy' : 'idle'}
      className={cn(onboardingStepVariants({ variant }), className)}
      {...props}
    >
      <StepIndicator step={step ?? (welcome ? '1' : '3')} />

      {welcome && (
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary">
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            strokeWidth={ICON_STROKE}
            aria-hidden
            className="size-6 text-on-primary"
          />
        </div>
      )}

      <div className="flex w-full flex-col gap-2">
        <h1 className={onboardingStepTitleVariants({ variant })}>{title}</h1>
        <p className="type-body-base-regular text-muted-foreground">{body}</p>
      </div>

      {!welcome && showContent && content}

      {footer && (
        <div
          className={cn(
            'flex w-full items-center gap-2',
            welcome ? 'justify-end' : 'justify-between'
          )}
        >
          {!welcome && (
            <div className="flex items-start gap-2">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  label="Back"
                  showIconStart
                  iconStart={ArrowLeft01Icon}
                  onClick={onBack}
                />
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {!welcome && onSkip && (
              <Button variant="ghost" size="sm" label={skipLabel} onClick={onSkip} />
            )}
            {!hidePrimary && (
              <Button
                variant="primary"
                size={welcome ? 'base' : 'sm'}
                label={busy ? busyLabel : label}
                loading={busy}
                disabled={busy || primaryDisabled}
                showIconEnd={welcome && !busy}
                iconEnd={ArrowRight01Icon}
                onClick={onPrimary}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
