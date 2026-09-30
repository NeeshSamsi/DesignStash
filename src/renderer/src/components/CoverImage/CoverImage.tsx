import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import {
  COVER_IMAGE_CONTRACT,
  COVER_IMAGE_DEFAULTS,
  type CoverImageContractProps
} from './CoverImage.types'
import { coverImageVariants } from './CoverImage.variants'

export interface CoverImageProps extends CoverImageContractProps {
  className?: string
}

/**
 * CoverImage — The one way to render a mockup cover (4:3, squircle mask).
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-1121
 * Today: extract from MockupTile.tsx
 */
export function CoverImage({ className, ...rest }: CoverImageProps) {
  const props = { ...COVER_IMAGE_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="CoverImage" on the root element.
  return (
    <ScaffoldStub
      contract={COVER_IMAGE_CONTRACT}
      props={props}
      className={cn(coverImageVariants({ size: props.size, state: props.state }), className)}
    />
  )
}
