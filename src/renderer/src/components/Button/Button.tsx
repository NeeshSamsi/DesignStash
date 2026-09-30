import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { BUTTON_CONTRACT, BUTTON_DEFAULTS, type ButtonContractProps } from './Button.types'
import { buttonVariants } from './Button.variants'

export interface ButtonProps extends ButtonContractProps {
  className?: string
}

/**
 * Button — Every clickable action. loading shows the Spinner; disabled = 50% opacity; focus = 2px border/focus ring outside.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-2091
 * Today: ui/button.tsx (variant="default" ↔ primary, size="default" ↔ base)
 */
export function Button({ className, ...rest }: ButtonProps) {
  const props = { ...BUTTON_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Button" on the root element.
  return (
    <ScaffoldStub
      contract={BUTTON_CONTRACT}
      props={props}
      className={cn(buttonVariants({ variant: props.variant, size: props.size }), className)}
    />
  )
}
