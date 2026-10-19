import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  VARIANT_STRIP_CONTRACT,
  VARIANT_STRIP_DEFAULTS,
  type VariantStripContractProps
} from './VariantStrip.types'
import { variantStripVariants } from './VariantStrip.variants'

export interface VariantStripProps extends VariantStripContractProps {
  className?: string
}

/**
 * VariantStrip — A pile's variants under the cover (V1a): VariantThumbs on fixed 92px slots from the cover's left edge, an arrow on a fade only at an end with more, and a status row (name · n of N, then the Top mark or Put on top).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=222-3432
 * Today: extract from DetailModal.tsx
 */
export function VariantStrip({ className, ...rest }: VariantStripProps) {
  const props = { ...VARIANT_STRIP_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="VariantStrip" on the root element.
  return (
    <ScaffoldStub
      contract={VARIANT_STRIP_CONTRACT}
      props={props}
      className={cn(
        variantStripVariants({ overflow: props.overflow, missingCover: props.missingCover }),
        className
      )}
    />
  )
}
