import { cn } from '@renderer/lib/utils'
import { Skeleton } from '@renderer/components/Skeleton'
import { Spinner } from '@renderer/components/Spinner'
import { LOADING_STATE_DEFAULTS, type LoadingStateContractProps } from './LoadingState.types'
import { loadingStateVariants } from './LoadingState.variants'

export interface LoadingStateProps extends LoadingStateContractProps {
  /** Skeleton count for the grid (cards) and list (rows) variants. */
  count?: number
  className?: string
}

const GRID_COUNT = 6
const LIST_COUNT = 3

function repeat(count: number, variant: 'card' | 'row') {
  return Array.from({ length: count }, (_, i) => <Skeleton key={i} variant={variant} />)
}

/**
 * LoadingState — Waiting states: content-shaped skeletons, or a small spinner inline.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=214-476
 * Page loads never show a spinner: `page` is a caption over the skeleton grid, and the skeleton
 * variants mirror the real layout (cards or rows) with the message kept for screen readers.
 */
export function LoadingState({ className, count, ...rest }: LoadingStateProps) {
  const props = { ...LOADING_STATE_DEFAULTS, ...rest }
  const root = {
    'data-ds': 'LoadingState',
    'data-variant': props.variant,
    role: 'status',
    'aria-busy': true,
    className: cn(loadingStateVariants({ variant: props.variant }), className)
  } as const

  switch (props.variant) {
    case 'inline':
      return (
        <div {...root}>
          <Spinner size="sm" aria-hidden />
          <p className="type-caption-xs-regular text-muted-foreground">{props.message}</p>
        </div>
      )
    case 'skeleton-grid':
      return (
        <div {...root}>
          <span className="sr-only">{props.message}</span>
          {repeat(count ?? GRID_COUNT, 'card')}
        </div>
      )
    case 'skeleton-list':
      return (
        <div {...root}>
          <span className="sr-only">{props.message}</span>
          {repeat(count ?? LIST_COUNT, 'row')}
        </div>
      )
    case 'page':
      return (
        <div {...root}>
          <div className="flex flex-col gap-1">
            <p className="type-body-sm-regular text-muted-foreground">{props.message}</p>
            {props.showSub && (
              <p className="type-caption-xs-regular text-tertiary">
                This usually only takes a second.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-6">{repeat(count ?? GRID_COUNT, 'card')}</div>
        </div>
      )
  }
}
