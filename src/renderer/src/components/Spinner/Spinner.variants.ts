import { cva } from 'class-variance-authority'

// TODO(port): fill every class slot from Figma — https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-32
// Colours: the Figma token name (bg-surface-3, text-tertiary, border-focus…) except the five
// shadcn owns — text-foreground, text-muted-foreground, bg-primary, border-primary, border-input.
// Type: type-<role>-<size>-<weight>. States: hover: focus-visible: active: disabled: (never variants).
// shadcn-backed primitive? Restyle ui/ instead and make this component a thin adapter (design/README.md).
export const spinnerVariants = cva('', {
  variants: {
    size: {
      sm: '',
      base: '',
      lg: ''
    }
  },
  defaultVariants: { size: 'base' }
})
