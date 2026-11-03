import { MultiplicationSignCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@renderer/lib/utils'
import { DROP_HINT_DEFAULTS, type DropHintContractProps } from './DropHint.types'
import { dropHintVariants } from './DropHint.variants'

export interface DropHintProps extends DropHintContractProps {
  className?: string
}

/**
 * DropHint — Cursor-following label shown while files are dragged over a non-droppable area. My Stash and To sort are the only drop targets.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=374-5713
 * Presentational: the caller positions it at the cursor.
 */
export function DropHint({ className, ...rest }: DropHintProps) {
  const props = { ...DROP_HINT_DEFAULTS, ...rest }
  return (
    <div data-ds="DropHint" role="status" className={cn(dropHintVariants(), className)}>
      <HugeiconsIcon
        icon={MultiplicationSignCircleIcon}
        strokeWidth={2}
        className="size-4 shrink-0"
      />
      <p className="type-caption-xs-regular text-foreground">{props.label}</p>
    </div>
  )
}
