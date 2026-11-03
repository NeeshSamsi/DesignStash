import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { LIGHTBOX_CONTRACT, LIGHTBOX_DEFAULTS, type LightboxContractProps } from './Lightbox.types'
import { lightboxVariants } from './Lightbox.variants'

export interface LightboxProps extends LightboxContractProps {
  className?: string
}

/**
 * Lightbox — Full-window cover viewer with zoom and prev/next for group variants.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=218-2719
 * Today: FullscreenPreview.tsx
 */
export function Lightbox({ className, ...rest }: LightboxProps) {
  const props = { ...LIGHTBOX_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Lightbox" on the root element.
  return (
    <ScaffoldStub
      contract={LIGHTBOX_CONTRACT}
      props={props}
      className={cn(lightboxVariants({ mode: props.mode, state: props.state }), className)}
    />
  )
}
