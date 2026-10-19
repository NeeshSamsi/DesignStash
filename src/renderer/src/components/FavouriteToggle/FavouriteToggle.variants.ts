import { cva } from 'class-variance-authority'

// Figma FavouriteToggle 217:1150. 28px squircle; overlay sits on a cover scrim, inline in the detail header.
export const favouriteToggleVariants = cva(
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        overlay: 'bg-overlay',
        inline: 'hover:bg-surface-2-hover'
      },
      // On = brand, with the star filled in the component.
      pressed: { true: 'text-brand', false: 'text-foreground' }
    },
    defaultVariants: { variant: 'overlay', pressed: false }
  }
)
