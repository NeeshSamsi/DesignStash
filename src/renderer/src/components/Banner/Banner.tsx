import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { BANNER_CONTRACT, BANNER_DEFAULTS, type BannerContractProps } from './Banner.types'
import { bannerVariants } from './Banner.variants'

export interface BannerProps extends BannerContractProps {
  className?: string
}

/**
 * Banner — Persistent inline message at the top of a view.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-777
 * Today: ui/alert.tsx → Banner
 */
export function Banner({ className, ...rest }: BannerProps) {
  const props = { ...BANNER_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Banner" on the root element.
  return (
    <ScaffoldStub
      contract={BANNER_CONTRACT}
      props={props}
      className={cn(bannerVariants({ tone: props.tone }), className)}
    />
  )
}
