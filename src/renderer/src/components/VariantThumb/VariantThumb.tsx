import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  VARIANT_THUMB_CONTRACT,
  VARIANT_THUMB_DEFAULTS,
  type VariantThumbContractProps
} from './VariantThumb.types'
import { variantThumbVariants } from './VariantThumb.variants'

export interface VariantThumbProps extends VariantThumbContractProps {
  className?: string
}

/**
 * VariantThumb — One variant in a pile's VariantStrip: its cover in an 84×64 ring, its name, and the crown-03 Top mark when it is the top mockup. shown uses the shared selected ring (border/primary, 2px).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=751-7393
 * Today: part of VariantStrip
 */
export function VariantThumb({ className, ...rest }: VariantThumbProps) {
  const props = { ...VARIANT_THUMB_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="VariantThumb" on the root element.
  return (
    <ScaffoldStub
      contract={VARIANT_THUMB_CONTRACT}
      props={props}
      className={cn(variantThumbVariants({ state: props.state }), className)}
    />
  )
}
