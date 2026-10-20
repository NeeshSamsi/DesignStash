import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/ui/tooltip'
import { PATH_FIELD_DEFAULTS, type PathFieldContractProps } from './PathField.types'
import { pathFieldBoxVariants, pathFieldVariants } from './PathField.variants'

export interface PathFieldProps
  extends PathFieldContractProps, Omit<ComponentProps<'div'>, keyof PathFieldContractProps> {
  /** The folder, as a friendly path. Figma's sample until given. */
  path?: string
  /** The whole path, shown as a tooltip when `path` is cut short. */
  fullPath?: string
  /** Where it lives, in words: "Macintosh HD › Users › you › Pictures". */
  location?: string
  /** The line under the box. Figma's sample for the state until given. */
  hint?: string
  onChoose?: () => void
}

const HINTS = {
  default: 'Your PSDs get copied here. You can always move it later in Settings.',
  busy: 'Checking the folder…',
  'not-writable': 'We can’t stash anything in this folder. Mind picking another one?',
  'existing-library': 'There’s already a stash in here (128 mockups).'
} as const

const HINT_TONE = {
  default: 'text-tertiary',
  busy: 'text-tertiary',
  'not-writable': 'text-error',
  'existing-library': 'text-warning'
} as const

/**
 * PathField — Where the stash lives during onboarding: friendly path + location, with Choose….
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=223-3718
 * Errors: not writable, already a stash (the screen then opens a ChoiceDialog). Settings › My Stash has
 * its own path field with Change…. Busy swaps Choose… for a spinner and "Checking…".
 */
export function PathField({
  className,
  path = '~/Pictures/DesignStash',
  fullPath,
  location = 'Macintosh HD › Users › you › Pictures',
  hint,
  onChoose,
  ...rest
}: PathFieldProps) {
  const { state, ...props } = { ...PATH_FIELD_DEFAULTS, ...rest }
  const busy = state === 'busy'
  const pathText = <p className="truncate type-body-sm-medium text-foreground">{path}</p>
  return (
    <div
      data-ds="PathField"
      data-state={state}
      aria-busy={busy || undefined}
      className={cn(pathFieldVariants({ state }), className)}
      {...props}
    >
      <p className="type-label-xs-medium text-foreground">Stash location</p>
      <div className={pathFieldBoxVariants({ state })}>
        <HugeiconsIcon
          icon={Folder01Icon}
          strokeWidth={1.5}
          className={cn(
            'size-5 shrink-0',
            state === 'not-writable' && 'text-error',
            state === 'existing-library' && 'text-warning',
            (state === 'default' || busy) && 'text-brand'
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 whitespace-nowrap">
          {fullPath && fullPath !== path ? (
            <Tooltip>
              <TooltipTrigger asChild>{pathText}</TooltipTrigger>
              <TooltipContent side="top" align="start">
                {fullPath}
              </TooltipContent>
            </Tooltip>
          ) : (
            pathText
          )}
          <p className="truncate type-caption-xs-regular text-tertiary">{location}</p>
        </div>
        <Button
          variant="secondary"
          label={busy ? 'Checking…' : 'Choose…'}
          loading={busy}
          disabled={busy}
          onClick={onChoose}
        />
      </div>
      <p
        role={state === 'not-writable' ? 'alert' : 'status'}
        className={cn('type-caption-xs-regular', HINT_TONE[state])}
      >
        {hint ?? HINTS[state]}
      </p>
    </div>
  )
}
