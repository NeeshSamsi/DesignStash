import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import {
  FAVOURITE_TOGGLE_DEFAULTS,
  type FavouriteToggleContractProps
} from './FavouriteToggle.types'
import { favouriteToggleVariants } from './FavouriteToggle.variants'

export interface FavouriteToggleProps
  extends
    FavouriteToggleContractProps,
    Omit<ComponentProps<'button'>, keyof FavouriteToggleContractProps> {
  /** Called with the new value when the star is clicked (unless onClick prevents default). */
  onPressedChange?: (pressed: boolean) => void
}

/**
 * FavouriteToggle — Star on/off on a squircle; overlay on covers, inline in the detail header.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1150
 * Pass an aria-label that names the mockup if several stars share a page.
 */
export function FavouriteToggle({
  className,
  onClick,
  onPressedChange,
  ...rest
}: FavouriteToggleProps) {
  const { variant, pressed, ...props } = { ...FAVOURITE_TOGGLE_DEFAULTS, ...rest }
  return (
    <button
      type="button"
      data-ds="FavouriteToggle"
      aria-pressed={pressed}
      aria-label={pressed ? 'Remove star' : 'Star'}
      className={cn(favouriteToggleVariants({ variant, pressed }), className)}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onPressedChange?.(!pressed)
      }}
      {...props}
    >
      <HugeiconsIcon
        icon={StarIcon}
        strokeWidth={1.5}
        className={cn('size-4', pressed && '[&_path]:fill-current')}
      />
    </button>
  )
}
