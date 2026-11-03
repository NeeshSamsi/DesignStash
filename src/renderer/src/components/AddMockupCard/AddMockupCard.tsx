import { ICON_STROKE } from '@renderer/design-system/icon'
import type { ComponentProps } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { cn } from '@renderer/lib/utils'
import type { AddMockupCardContractProps } from './AddMockupCard.types'
import { addMockupCardCoverVariants, addMockupCardVariants } from './AddMockupCard.variants'

export interface AddMockupCardProps extends AddMockupCardContractProps, ComponentProps<'button'> {}

/**
 * AddMockupCard — The add affordance in the library grid: always the first card in My Stash › All (hidden in search, filter and Starred); on an empty library it is the only card. Recessed well with a faint dashed cover, same footprint as MockupCard. Click / ↵ opens the Add menu; dragging PSDs over the window shows DropOverlay. Rules: design/specs/library.md.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=583-6960
 * A button, so the grid's DropdownMenu can wrap it with `asChild`. It is never selectable.
 */
export function AddMockupCard({ className, ...props }: AddMockupCardProps) {
  return (
    <button
      type="button"
      data-ds="AddMockupCard"
      className={cn(addMockupCardVariants(), className)}
      {...props}
    >
      <span className={addMockupCardCoverVariants()}>
        <HugeiconsIcon
          icon={PlusSignIcon}
          strokeWidth={ICON_STROKE}
          className="size-6 text-muted-foreground transition-colors group-hover/add:text-brand"
        />
      </span>
      <span className="flex flex-col gap-0.5 pl-1">
        <span className="type-body-sm-medium text-muted-foreground group-hover/add:text-foreground group-focus-visible/add:text-foreground">
          Add mockup
        </span>
        <span className="type-caption-xs-regular text-tertiary">PSDs, zips or a folder</span>
      </span>
    </button>
  )
}
