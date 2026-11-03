import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  MOCKUP_CARD_CONTRACT,
  MOCKUP_CARD_DEFAULTS,
  type MockupCardContractProps
} from './MockupCard.types'
import { mockupCardVariants } from './MockupCard.variants'

export interface MockupCardProps extends MockupCardContractProps {
  className?: string
}

/**
 * MockupCard — A mockup in any grid: squircle container, cover zoom on hover, icon-only Open / Zoom.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1492
 * Today: MockupTile.tsx
 */
export function MockupCard({ className, ...rest }: MockupCardProps) {
  const props = { ...MOCKUP_CARD_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="MockupCard" on the root element.
  return (
    <ScaffoldStub
      contract={MOCKUP_CARD_CONTRACT}
      props={props}
      className={cn(mockupCardVariants({ variant: props.variant, state: props.state }), className)}
    />
  )
}
