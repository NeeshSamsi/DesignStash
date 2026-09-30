import { ScaffoldStub } from '@renderer/design-system/ScaffoldStub'
import { cn } from '@renderer/lib/utils'
import { SKELETON_CONTRACT, SKELETON_DEFAULTS, type SkeletonContractProps } from './Skeleton.types'
import { skeletonVariants } from './Skeleton.variants'

export interface SkeletonProps extends SkeletonContractProps {
  className?: string
}

/**
 * Skeleton — Content-shaped loading placeholders; card = MockupCard skeleton, row = ListRow skeleton.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-118
 * Today: ui/skeleton.tsx
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  const props = { ...SKELETON_DEFAULTS, ...rest }
  // TODO(port): replace ScaffoldStub with the real markup. Keep the props contract and
  // data-ds="Skeleton" on the root element.
  return (
    <ScaffoldStub
      contract={SKELETON_CONTRACT}
      props={props}
      className={cn(skeletonVariants({ variant: props.variant }), className)}
    />
  )
}
