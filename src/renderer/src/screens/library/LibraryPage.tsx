import { useCallback, useEffect, useMemo, type MouseEvent } from 'react'
import { Cancel01Icon, FileAddIcon, FolderAddIcon, Search02Icon, StarIcon } from '@hugeicons/core-free-icons'
import { IPC_CHANNELS } from '@shared/ipc'
import type { LibraryItem } from '@shared/library'
import { AddMockupCard } from '@renderer/components/AddMockupCard'
import { Banner } from '@renderer/components/Banner'
import { DropdownMenu } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import { EmptyState } from '@renderer/components/EmptyState'
import { ErrorState } from '@renderer/components/ErrorState'
import { LibraryToolbar } from '@renderer/components/LibraryToolbar'
import { MockupCard } from '@renderer/components/MockupCard'
import type { MockupCardState } from '@renderer/components/MockupCard/MockupCard.types'
import { MockupGrid } from '@renderer/components/MockupGrid'
import type { MockupGridState } from '@renderer/components/MockupGrid/MockupGrid.types'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { noResultsCopy } from '@renderer/lib/library-list'
import { filterChips, toggleCategory } from '@renderer/lib/tag-filter'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { useLibraryData } from './useLibraryData'

export interface LibraryPageProps {
  /** The Starred page. Defaults to the current view in the UI store. */
  starredOnly?: boolean
  /** The import entry points behind the Add card and the empty-space menu. */
  onAddFiles?: () => void
  onAddFolder?: () => void
}

const cardTags = (item: LibraryItem) =>
  item.tags
    .slice(0, 3)
    .map((tag) => tag.label)
    .join(' · ')

function cardState(item: LibraryItem, selected: boolean): MockupCardState {
  if (item.coverMissing) return 'cover-missing'
  if (item.coverSource === 'none') return 'no-preview'
  return selected ? 'selected' : 'default'
}

/** The title-bar search field keeps its own text, so clear it through its own × to keep them in step. */
function clearTitleBarSearch(fallback: () => void) {
  const clear = document.querySelector<HTMLButtonElement>(
    '[data-ds="GlobalSearch"] button[aria-label="Clear search"]'
  )
  if (clear) clear.click()
  else fallback()
}

/**
 * My Stash (All and Starred): toolbar, grid, search results and the states between.
 * Figma: ↳ Library › C · Library. Rules: design/specs/library.md.
 */
export default function LibraryPage({
  starredOnly: starredProp,
  onAddFiles,
  onAddFolder
}: LibraryPageProps) {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const openModal = useUiStore((s) => s.openModal)
  const starredOnly = starredProp ?? view === 'starred'

  const items = useLibraryStore((s) => s.items)
  const stats = useLibraryStore((s) => s.stats)
  const query = useLibraryStore((s) => s.query)
  const setQuery = useLibraryStore((s) => s.setQuery)
  const sort = useLibraryStore((s) => s.sort)
  const setSort = useLibraryStore((s) => s.setSort)
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const setTagFilter = useLibraryStore((s) => s.setTagFilter)
  const categoryIds = useLibraryStore((s) => s.categoryIds)
  const setCategoryIds = useLibraryStore((s) => s.setCategoryIds)

  const { loaded, failed, refresh, keepLingering, releaseLingering, tagCategories } =
    useLibraryData(starredOnly)

  const ids = useMemo(() => items.map((item) => String(item.id)), [items])
  const selection = useGridSelection(ids)

  // Detail can ask for mockups to be selected once the grid has reloaded (Disband pile).
  const selectIds = selection.set
  useEffect(() => {
    const pending = useDetailEffects.getState().takePendingSelection()
    if (pending.length > 0) selectIds(pending.map(String))
  }, [items, selectIds])

  const searching = query.trim() !== ''
  const filterCount = tagFilter.length + categoryIds.length
  const filtering = filterCount > 0

  const state: MockupGridState = !loaded && !failed
    ? 'loading'
    : failed && items.length === 0
      ? 'error'
      : items.length === 0
        ? !searching && !filtering && !starredOnly
          ? 'empty'
          : 'no-results'
        : 'populated'
  const showAdd = !starredOnly && !searching && !filtering

  const clearFilters = () => {
    setTagFilter([])
    setCategoryIds([])
  }

  // Filter chips and the popover share one selection; ticking “All in …” drops that category's tags.
  const selectionState = { tagIds: tagFilter, categoryIds }
  const chips = filterChips(tagCategories, selectionState, {
    onRemoveTag: (tagId) => setTagFilter(tagFilter.filter((id) => id !== tagId)),
    onRemoveCategory: (categoryId) => setCategoryIds(categoryIds.filter((id) => id !== categoryId))
  })
  const onToggleCategory = (categoryId: number) => {
    const category = tagCategories.find((c) => c.categoryId === categoryId)
    const next = toggleCategory(
      selectionState,
      categoryId,
      category?.tags.map((tag) => tag.tagId) ?? []
    )
    setTagFilter(next.tagIds)
    setCategoryIds(next.categoryIds)
  }

  const toggleFavourite = useCallback(
    async (item: LibraryItem, favourite: boolean) => {
      const setFavourite = (id: number, value: boolean) => {
        const state = useLibraryStore.getState()
        state.setItems(state.items.map((i) => (i.id === id ? { ...i, favourite: value } : i)))
      }
      const apply = async (id: number, value: boolean) => {
        setFavourite(id, value)
        const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, {
          mockupId: id,
          favourite: value
        })
        if (!res.success) {
          setFavourite(id, !value)
          toast({ variant: 'error', message: 'Couldn’t update the star. Try again.' })
          return false
        }
        const statsRes = await window.api.invoke(IPC_CHANNELS.LIBRARY_STATS, undefined)
        if (statsRes.success) useLibraryStore.getState().setStats(statsRes.data)
        return true
      }
      if (!(await apply(item.id, favourite))) return
      // In Starred the card stays until you leave, with Undo.
      if (starredOnly && !favourite) {
        keepLingering(item.id)
        undoToast('Removed from Starred', () => {
          releaseLingering(item.id)
          void apply(item.id, true)
        })
      }
    },
    [starredOnly, keepLingering, releaseLingering]
  )

  const openDetail = (id: number) => openModal({ kind: 'detail', mockupId: id })

  const itemFor = (target: EventTarget) => {
    const id = (target as Element).closest<HTMLElement>('[data-mockup-id]')?.dataset.mockupId
    return id === undefined ? undefined : items.find((item) => String(item.id) === id)
  }
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const item = itemFor(event.target)
    if (item) openDetail(item.id)
  }

  const openInPhotoshop = async (item: LibraryItem) => {
    const res = await window.api.invoke(IPC_CHANNELS.MOCKUP_OPEN_EXTERNAL, { mockupId: item.id })
    if (res.success && !res.data.opened) {
      toast({
        variant: 'error',
        message:
          res.data.reason === 'no-app'
            ? 'Photoshop isn’t installed on this Mac.'
            : 'Couldn’t open this in Photoshop. Try again.'
      })
    }
  }

  const addCard = (
    <DropdownMenu
      align="start"
      trigger={<AddMockupCard />}
      items={
        <>
          <DropdownMenuItem
            label="Add files…"
            icon={FileAddIcon}
            shortcut="⌘O"
            {...(onAddFiles ? { onSelect: onAddFiles } : { disabled: true })}
          />
          <DropdownMenuItem
            label="Add folder…"
            icon={FolderAddIcon}
            shortcut="⇧⌘O"
            {...(onAddFolder ? { onSelect: onAddFolder } : { disabled: true })}
          />
        </>
      }
    />
  )

  const copy = noResultsCopy({ query, filterCount, starred: starredOnly })
  const clearAction =
    searching && filtering
      ? () => {
          clearTitleBarSearch(() => setQuery(''))
          clearFilters()
        }
      : searching
        ? () => clearTitleBarSearch(() => setQuery(''))
        : clearFilters

  const total = stats.total
  const statsText =
    selection.count > 0
      ? `${selection.count} of ${total} selected`
      : searching || filtering
        ? `${items.length} of ${total} items`
        : `${total} ${total === 1 ? 'item' : 'items'}${
            stats.favourites > 0 ? ` · ${stats.favourites} favourites` : ''
          }`

  return (
    <div className="flex min-h-full flex-col gap-4 p-6">
      <LibraryToolbar
        stats={statsText}
        chips={chips}
        onClearFilters={clearFilters}
        sort={sort}
        onSortChange={setSort}
        tagFilter={{
          categories: tagCategories,
          selectedTagIds: tagFilter,
          onSelectedTagIdsChange: setTagFilter,
          pickedCategoryIds: categoryIds,
          onToggleCategory,
          onManageTags: () => setView('settings')
        }}
      />
      {failed && items.length > 0 && (
        <Banner
          tone="error"
          title="Couldn’t refresh your stash"
          message="Showing what was here a moment ago."
          action
          actionLabel="Try again"
          onAction={() => void refresh()}
          dismissible={false}
        />
      )}
      <MockupGrid
        state={state}
        showAdd={showAdd}
        selection={selection}
        addCard={addCard}
        data-shortcut-scope="grid"
        onDoubleClick={onDoubleClick}
        noResults={
          <EmptyState
            variant="page"
            icon={starredOnly && !searching && !filtering ? StarIcon : Search02Icon}
            title={copy.title}
            description={copy.description}
            primaryLabel={copy.clearLabel}
            primaryIcon={Cancel01Icon}
            onPrimary={clearAction}
          />
        }
        error={
          <ErrorState
            variant="page"
            title="Couldn’t load your stash"
            message="Try again in a moment."
            onRetry={() => void refresh()}
            secondaryLabel={null}
          />
        }
      >
        {items.map((item) => (
          <MockupCard
            key={item.id}
            mockupId={String(item.id)}
            title={item.title}
            tags={cardTags(item)}
            {...(item.coverPath ? { coverSrc: `file://${item.coverPath}` } : {})}
            variantCount={item.variantCount}
            favourite={item.favourite}
            state={cardState(item, selection.isSelected(String(item.id)))}
            onToggleFavourite={(favourite) => void toggleFavourite(item, favourite)}
            onOpenInPhotoshop={() => void openInPhotoshop(item)}
            onEditDetails={() => openDetail(item.id)}
          />
        ))}
      </MockupGrid>
    </div>
  )
}
