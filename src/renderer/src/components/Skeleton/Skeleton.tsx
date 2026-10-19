import { cn } from '@renderer/lib/utils'
import { Skeleton as UiSkeleton } from '@renderer/ui/skeleton'
import { SKELETON_DEFAULTS, type SkeletonContractProps } from './Skeleton.types'
import { skeletonVariants } from './Skeleton.variants'

export interface SkeletonProps extends SkeletonContractProps {
  className?: string
}

/** Two text lines (200 and 140 wide), shared by `line` and `row`. */
function Lines() {
  return (
    <>
      <UiSkeleton className="h-3 w-50 rounded-full" />
      <UiSkeleton className="h-3 w-35 rounded-full" />
    </>
  )
}

/**
 * Skeleton — Content-shaped loading placeholders; card = MockupCard skeleton, row = ListRow skeleton.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=211-118
 * Shapes over ui/skeleton.tsx (surface-3, pulsing). Page loads use these, never Spinner.
 */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  const props = { ...SKELETON_DEFAULTS, ...rest }
  const root = {
    'data-ds': 'Skeleton',
    'data-variant': props.variant,
    'aria-hidden': true,
    className: cn(skeletonVariants({ variant: props.variant }), className)
  } as const

  switch (props.variant) {
    case 'block':
    case 'circle':
      return <UiSkeleton {...root} />
    case 'line':
      return (
        <div {...root}>
          <Lines />
        </div>
      )
    case 'card':
      return (
        <div {...root}>
          <UiSkeleton className="h-45 w-full rounded-xl" />
          <UiSkeleton className="h-3 w-45 rounded-full" />
          <UiSkeleton className="h-3 w-30 rounded-full" />
        </div>
      )
    case 'row':
      return (
        <div {...root}>
          <UiSkeleton className="size-10 shrink-0" />
          <div className="flex flex-col gap-2">
            <Lines />
          </div>
        </div>
      )
  }
}
