import type { ComponentProps } from 'react'
import { cn } from '@renderer/lib/utils'
import { Spinner as UiSpinner } from '@renderer/ui/spinner'
import { SPINNER_DEFAULTS, type SpinnerContractProps } from './Spinner.types'
import { spinnerVariants } from './Spinner.variants'

export interface SpinnerProps
  extends SpinnerContractProps, Pick<ComponentProps<'svg'>, 'aria-hidden' | 'aria-label'> {
  className?: string
}

const UI_SIZE = { sm: 'sm', base: 'default', lg: 'lg' } as const

/**
 * Spinner — Indeterminate activity for short waits (Hugeicons loading-03, rotated in code).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-32
 * Thin adapter over ui/spinner.tsx (Figma `base` → shadcn `default`).
 */
export function Spinner({ className, ...rest }: SpinnerProps) {
  const { size, ...aria } = { ...SPINNER_DEFAULTS, ...rest }
  return (
    <UiSpinner
      data-ds="Spinner"
      size={UI_SIZE[size]}
      className={cn(spinnerVariants({ size }), className)}
      {...aria}
    />
  )
}
