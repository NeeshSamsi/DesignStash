import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  FAVOURITE_TOGGLE_CONTRACT,
  FAVOURITE_TOGGLE_DEFAULTS,
  type FavouriteToggleContractProps
} from './FavouriteToggle.types'
import { favouriteToggleVariants } from './FavouriteToggle.variants'

export interface FavouriteToggleProps extends FavouriteToggleContractProps {
  className?: string
}

/**
 * FavouriteToggle — Star on/off on a squircle; overlay on covers, inline in the detail header.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1150
 */
export function FavouriteToggle({ className, ...rest }: FavouriteToggleProps) {
  const props = { ...FAVOURITE_TOGGLE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="FavouriteToggle" on the root element.
  return (
    <ScaffoldStub
      contract={FAVOURITE_TOGGLE_CONTRACT}
      props={props}
      className={cn(
        favouriteToggleVariants({ variant: props.variant, pressed: props.pressed }),
        className
      )}
    />
  )
}
