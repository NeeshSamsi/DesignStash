import { ICON_STROKE } from '@renderer/design-system/icon'
import { Fragment, useState } from 'react'
import { Cancel01Icon, Settings01Icon, Tag01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CategoryPill } from '@renderer/components/CategoryPill'
import { Checkbox } from '@renderer/components/Checkbox'
import { EmptyState } from '@renderer/components/EmptyState'
import { Tooltip } from '@renderer/components/Tooltip'
import {
  categoryCounts,
  filterTags,
  isUnused,
  narrowToCategory,
  toggleCategory,
  toggleTagId,
  totalTagCount,
  usedFirst,
  type FilterCategory
} from '@renderer/lib/tag-filter'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/Button'
import { InputGroup, InputGroupInput } from '@renderer/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  popoverPanelVariants
} from '@renderer/ui/popover'
import {
  TAG_FILTER_POPOVER_DEFAULTS,
  type TagFilterPopoverContractProps,
  type TagFilterPopoverState
} from './TagFilterPopover.types'
import { tagFilterListClass, tagFilterPopoverVariants } from './TagFilterPopover.variants'

export interface TagFilterPopoverProps extends TagFilterPopoverContractProps {
  /** The tags, grouped by category. Without it the popover shows Figma's sample (catalog). */
  categories?: FilterCategory[]
  /** Picked tag ids. Pass with `onSelectedTagIdsChange` to control it. */
  selectedTagIds?: number[]
  onSelectedTagIdsChange?: (tagIds: number[]) => void
  /** Categories picked as a whole (“All in Device”). Pass with `onToggleCategory` to control it. */
  pickedCategoryIds?: number[]
  /** Called with the category id when its “All in …” row is ticked or unticked. */
  onToggleCategory?: (categoryId: number) => void
  /** Called once by “Clear all”, after the popover has cleared its own state. */
  onClearAll?: () => void
  /** Search text. Pass with `onQueryChange` to control it. */
  query?: string
  onQueryChange?: (query: string) => void
  /** The category pill shown (null = All). Pass with `onCategoryChange` to control it. */
  categoryId?: number | null
  onCategoryChange?: (categoryId: number | null) => void
  /** The “Manage tags” action when there are no tags yet. */
  onManageTags?: () => void
  /** The element that opens it (the toolbar's Filter button). Without it the panel renders in place. */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** Figma's sample tags, so the catalog shows every state. */
const SAMPLE: FilterCategory[] = [
  {
    categoryId: 1,
    categoryLabel: 'Device',
    mockupCount: 41,
    tags: [
      { tagId: 10, label: 'iPhone', count: 24 },
      { tagId: 11, label: 'iPhone 15 Pro', count: 12 },
      { tagId: 12, label: 'iPad', count: 8 },
      { tagId: 13, label: 'MacBook', count: 6 },
      { tagId: 14, label: 'Apple Watch', count: 3 }
    ]
  },
  {
    categoryId: 2,
    categoryLabel: 'Style',
    mockupCount: 30,
    tags: [
      { tagId: 20, label: 'Clay', count: 12 },
      { tagId: 21, label: 'Glass', count: 7 },
      { tagId: 22, label: 'Realistic', count: 15 },
      { tagId: 23, label: 'Wireframe', count: 4 }
    ]
  },
  {
    categoryId: 3,
    categoryLabel: 'Scene',
    mockupCount: 22,
    tags: [
      { tagId: 30, label: 'Studio', count: 18 },
      { tagId: 31, label: 'Desk', count: 9 },
      { tagId: 32, label: 'Outdoor', count: 5 },
      { tagId: 33, label: 'Hand-held', count: 7 }
    ]
  },
  {
    categoryId: 4,
    categoryLabel: 'Colour',
    mockupCount: 15,
    tags: [
      { tagId: 40, label: 'Beige', count: 6 },
      { tagId: 41, label: 'Black', count: 11 },
      { tagId: 42, label: 'Clear', count: 2 }
    ]
  }
]

const SAMPLE_QUERY: Record<TagFilterPopoverState, string> = {
  open: '',
  'some-selected': '',
  searching: 'cl',
  'no-match': 'xyz',
  empty: '',
  'category-picked': ''
}

/** Controlled when `value` is given, otherwise it keeps its own state starting at `initial`. */
function useControllable<T>(
  value: T | undefined,
  initial: T,
  onChange: ((next: T) => void) | undefined
) {
  const [own, setOwn] = useState(initial)
  const current = value === undefined ? own : value
  const set = (next: T) => {
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }
  return [current, set] as const
}

/**
 * TagFilterPopover — Tag filter: search on top, category pills with live counts, tags grouped by category.
 * Figma: https://www.figma.com/design/fB8PHTrzz89lAQOhXbsHMK/DesignStash?node-id=217-2113
 * Flat, two tiers: one level of tags under each category. Search filters live and the pill counts
 * follow it; a pill narrows the list; ticked tags AND together. Rules: design/specs/library.md.
 */
export function TagFilterPopover({
  categories,
  selectedTagIds,
  onSelectedTagIdsChange,
  pickedCategoryIds,
  onToggleCategory,
  onClearAll,
  query: queryProp,
  onQueryChange,
  categoryId: categoryProp,
  onCategoryChange,
  onManageTags,
  trigger,
  open,
  onOpenChange,
  className,
  ...rest
}: TagFilterPopoverProps) {
  const props = { ...TAG_FILTER_POPOVER_DEFAULTS, ...rest }
  const demo = categories === undefined
  const data = demo ? (props.state === 'empty' ? [] : SAMPLE) : categories
  const [query, setQuery] = useControllable(
    queryProp,
    demo ? SAMPLE_QUERY[props.state] : '',
    onQueryChange
  )
  const [selected, setSelected] = useControllable(
    selectedTagIds,
    demo && props.state === 'some-selected' ? [10, 11] : [],
    onSelectedTagIdsChange
  )
  const [pickedCategories, setPickedCategories] = useControllable(
    pickedCategoryIds,
    demo && props.state === 'category-picked' ? [1] : [],
    undefined
  )
  const [categoryChoice, setCategoryChoice] = useControllable<number | null>(
    categoryProp,
    null,
    onCategoryChange
  )

  const matches = filterTags(data, query)
  const shown = narrowToCategory(matches, categoryChoice)
  // A search can empty the chosen category; the list then falls back to All, so the pill must too.
  const activeCategory =
    categoryChoice !== null && matches.some((c) => c.categoryId === categoryChoice)
      ? categoryChoice
      : null
  const searching = query.trim() !== ''
  const noTags = data.every((category) => category.tags.length === 0)
  // Ticking “All in <category>” covers its tags, so it also drops the ones already picked there.
  const toggleWholeCategory = (category: FilterCategory) => {
    const next = toggleCategory(
      { tagIds: selected, categoryIds: pickedCategories },
      category.categoryId,
      category.tags.map((tag) => tag.tagId)
    )
    if (next.tagIds.length !== selected.length) setSelected(next.tagIds)
    setPickedCategories(next.categoryIds)
    onToggleCategory?.(category.categoryId)
  }
  const clearEverything = () => {
    setSelected([])
    setPickedCategories([])
    if (onClearAll) onClearAll()
    else for (const categoryId of pickedCategories) onToggleCategory?.(categoryId)
  }
  const clearAll = (
    <Button
      variant="link"
      size="xs"
      disabled={selected.length === 0 && pickedCategories.length === 0}
      onClick={clearEverything}
    >
      Clear all
    </Button>
  )

  const body = noTags ? (
    <EmptyState
      variant="inline"
      icon={Tag01Icon}
      title="No tags yet"
      description="Tags show up once you stash some mockups. Or set them up yourself in Settings › Tags."
      primaryLabel="Manage tags"
      primaryIcon={Settings01Icon}
      {...(onManageTags ? { onPrimary: onManageTags } : {})}
      className="p-6"
    />
  ) : (
    <>
      <InputGroup>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${totalTagCount(data.map((c) => ({ ...c })))} tags`}
          aria-label="Search tags"
        />
        {searching && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="rounded-sm text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} className="size-4" />
          </button>
        )}
      </InputGroup>
      {matches.length > 0 && (
        <div role="group" aria-label="Narrow by category" className="flex flex-wrap gap-1">
          <CategoryPill
            label="All"
            count={String(totalTagCount(matches))}
            showCount={searching}
            active={activeCategory === null}
            onClick={() => setCategoryChoice(null)}
          />
          {categoryCounts(matches).map((category) => (
            <CategoryPill
              key={category.categoryId}
              label={category.categoryLabel}
              count={String(category.count)}
              active={activeCategory === category.categoryId}
              onClick={() => setCategoryChoice(category.categoryId)}
            />
          ))}
        </div>
      )}
      {matches.length === 0 ? (
        <div role="status" className="flex flex-col gap-1 py-4">
          <p className="type-body-sm-medium text-foreground">No tags match “{query.trim()}”</p>
          <p className="type-caption-xs-regular text-muted-foreground">
            Check the spelling, or clear the search to see every tag.
          </p>
        </div>
      ) : (
        <div className={tagFilterListClass}>
          {shown.map((category) => (
            <div
              key={category.categoryId}
              role="group"
              aria-label={category.categoryLabel}
              className="flex flex-col gap-1"
            >
              <h4 className="type-label-xs-medium text-tertiary">{category.categoryLabel}</h4>
              {!searching && (
                <Checkbox
                  label={`All in ${category.categoryLabel}`}
                  showCount={category.mockupCount !== undefined}
                  count={String(category.mockupCount ?? '')}
                  state={pickedCategories.includes(category.categoryId) ? 'checked' : 'unchecked'}
                  onCheckedChange={() => toggleWholeCategory(category)}
                />
              )}
              {usedFirst(category.tags).map((tag) => {
                const isPicked = selected.includes(tag.tagId)
                // A tag nothing carries stays visible but cannot be picked; one already picked
                // can still be unticked.
                const unused = isUnused(tag) && !isPicked
                const row = (
                  <Checkbox
                    label={tag.label}
                    disabled={pickedCategories.includes(category.categoryId) || unused}
                    showCount={tag.count !== undefined && !isUnused(tag)}
                    count={String(tag.count ?? '')}
                    state={isPicked ? 'checked' : 'unchecked'}
                    onCheckedChange={() => setSelected(toggleTagId(selected, tag.tagId))}
                  />
                )
                return unused ? (
                  <Tooltip key={tag.tagId} label="No mockups have this yet" arrow="none">
                    <span className="w-fit">{row}</span>
                  </Tooltip>
                ) : (
                  <Fragment key={tag.tagId}>{row}</Fragment>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )

  // Its own panel in Figma (one padded column, no regions), so it sits on the ui primitives directly.
  const panel = (
    <>
      <PopoverHeader>
        <PopoverTitle>Tags</PopoverTitle>
        {clearAll}
      </PopoverHeader>
      <div data-ds="TagFilterPopover" data-state={props.state} className="contents">
        {body}
      </div>
    </>
  )
  const classes = cn(tagFilterPopoverVariants({ state: props.state }), className)

  if (trigger === undefined) {
    return <div className={cn(popoverPanelVariants({ size: 'default' }), classes)}>{panel}</div>
  }
  return (
    <Popover {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent size="default" className={classes}>
        {panel}
      </PopoverContent>
    </Popover>
  )
}
