import { ICON_STROKE } from '@renderer/design-system/icon'
import { FilterHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Select } from '@renderer/components/Select'
import { TagChip } from '@renderer/components/TagChip'
import { TagFilterPopover, type TagFilterPopoverProps } from '@renderer/components/TagFilterPopover'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/ui/badge'
import { Button } from '@renderer/ui/button'
import { LIBRARY_TOOLBAR_DEFAULTS, type LibraryToolbarContractProps } from './LibraryToolbar.types'
import { libraryToolbarVariants } from './LibraryToolbar.variants'

/** A picked filter: a tag (“Device iPhone”) or a whole category (label only). */
export interface ToolbarChip {
  key: string | number
  category?: string
  label: string
  onRemove?: () => void
}

export type LibrarySort = 'date' | 'name'

const SORT_OPTIONS = [
  { value: 'date', label: 'Date added' },
  { value: 'name', label: 'Name' }
]

export interface LibraryToolbarProps extends LibraryToolbarContractProps {
  /** Picked filters. Without it the toolbar shows Figma's sample for `filters` (catalog). */
  chips?: ToolbarChip[]
  onClearFilters?: () => void
  /** Props for the tag filter popover the Filter button opens. */
  tagFilter?: Omit<TagFilterPopoverProps, 'trigger'>
  /** Nothing to filter or sort yet (an empty stash): both controls go quiet. */
  disabled?: boolean
  sort?: LibrarySort
  onSortChange?: (sort: LibrarySort) => void
  className?: string
}

const SAMPLE_CHIPS: ToolbarChip[] = [
  { key: 'device', category: 'Device', label: 'iPhone' },
  { key: 'style', category: 'Style', label: 'Clay' }
]

/** Filter is the quiet outline (outline-subtle) with smaller text. Padding keeps the 34px height. */
const HAIRLINE_BUTTON = 'py-2 type-label-xs-medium'
const HAIRLINE_SORT =
  'border-subtle bg-transparent type-caption-xs-regular hover:border-input data-[size=sm]:py-2'

/**
 * LibraryToolbar — Filter (+count) → TagFilterPopover, active chips + Clear, stats, sort Select.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-2228
 * Search lives in the title bar. The toolbar always shows, even at 0 items, so content starts at
 * the same height on every screen.
 */
export function LibraryToolbar({
  className,
  chips,
  onClearFilters,
  tagFilter,
  sort = 'date',
  onSortChange,
  disabled = false,
  ...rest
}: LibraryToolbarProps) {
  const props = { ...LIBRARY_TOOLBAR_DEFAULTS, ...rest }
  const picked = chips ?? (props.filters === 'active' ? SAMPLE_CHIPS : [])
  const active = picked.length > 0

  const filterButton = (
    <Button variant="outline-subtle" size="sm" disabled={disabled} className={HAIRLINE_BUTTON}>
      <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={ICON_STROKE} />
      Filter
    </Button>
  )

  return (
    <div
      data-ds="LibraryToolbar"
      data-filters={active ? 'active' : 'none'}
      className={cn(libraryToolbarVariants({ filters: active ? 'active' : 'none' }), className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TagFilterPopover {...tagFilter} trigger={filterButton} />
        {active && (
          <>
            <Badge aria-label={`${picked.length} filters`}>{picked.length}</Badge>
            {picked.map((chip) => (
              <TagChip
                key={chip.key}
                variant="filter"
                showCategory={chip.category !== undefined}
                category={chip.category ?? ''}
                label={chip.label}
                {...(chip.onRemove ? { onRemove: chip.onRemove } : {})}
              />
            ))}
            <Button variant="link" size="xs" onClick={onClearFilters}>
              Clear
            </Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {props.showStats && props.stats !== '' && (
          <p className="type-caption-xs-regular text-tertiary">{props.stats}</p>
        )}
        <Select
          size="sm"
          value={sort}
          options={SORT_OPTIONS}
          aria-label="Sort order"
          disabled={disabled}
          className={HAIRLINE_SORT}
          onValueChange={(value) => onSortChange?.(value as LibrarySort)}
        />
      </div>
    </div>
  )
}
