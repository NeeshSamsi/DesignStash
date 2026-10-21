import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { ArrowLeft01Icon, Cancel01Icon, Search02Icon, StarIcon } from '@hugeicons/core-free-icons'
import { coverDisplay, type LibraryItem } from '@shared/library'
import { Banner } from '@renderer/components/Banner'
import { Badge } from '@renderer/ui/badge'
import { EmptyState } from '@renderer/components/EmptyState'
import { ErrorState } from '@renderer/components/ErrorState'
import { LibraryToolbar } from '@renderer/components/LibraryToolbar'
import { CoverImage } from '@renderer/components/CoverImage'
import { MockupGrid } from '@renderer/components/MockupGrid'
import type { MockupGridState } from '@renderer/components/MockupGrid/MockupGrid.types'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { useGuardedSelection } from '../details/use-guarded-selection'
import {
  draggedItems,
  dropHint,
  noResultsCopy,
  pilesIn,
  planDrop,
  planNewPile
} from '@renderer/lib/library-list'
import { filterChips, toggleCategory } from '@renderer/lib/tag-filter'
import { useShortcut } from '@renderer/lib/shortcuts'
import { useDetailEffects } from '@renderer/stores/detailEffectsStore'
import { useDetailsStore } from '@renderer/stores/detailsStore'
import { useLibraryStore } from '@renderer/stores/libraryStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { CardMenu, type MenuTarget } from './CardMenu'
import { LibraryCard } from './LibraryCard'
import { PilePage } from './PilePage'
import { AddCardMenu } from '../gather/AddCardMenu'
import { WaitingToSortStrip } from './WaitingToSortStrip'
import { useLibraryActions } from './useLibraryActions'
import { useLibraryData } from './useLibraryData'
import { useLibraryPiles } from './useLibraryPiles'
import { coverUrl } from '@shared/cover-url'
import type { InboxItem } from '@shared/inbox'

export interface LibraryPageProps {
  /** The Starred page. Defaults to the current view in the UI store. */
  starredOnly?: boolean
  /** The import entry points behind the Add card and the empty-space menu. */
  onAddFiles?: () => void
  onAddFolder?: () => void
  /** Sort now on the waiting strip: opens Sort on what is in To sort. */
  onSortWaiting?: (items: InboxItem[]) => void
}

const cardTags = (item: LibraryItem) =>
  item.tags
    .slice(0, 3)
    .map((tag) => tag.label)
    .join(' · ')

/**
 * My Stash (All and Starred): toolbar, grid, search results and the states between.
 * Figma: ↳ Library › C · Library. Rules: design/specs/library.md.
 */
export default function LibraryPage({
  starredOnly: starredProp,
  onAddFiles,
  onAddFolder,
  onSortWaiting
}: LibraryPageProps) {
  const view = useUiStore((s) => s.view)
  const openSettings = useUiStore((s) => s.openSettings)
  const pageOpen = useDetailsStore((s) => s.pile)
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
  const rawSelection = useGridSelection(ids)
  // Every way of changing the selection asks first when the sidebar holds unsaved edits.
  const selection = useGuardedSelection(rawSelection)

  // The sidebar follows the selection: one mockup shows in it, none (or several) closes it. While the
  // pile page is up it follows that page's selection instead.
  const sidebarId = rawSelection.count === 1 ? Number(rawSelection.selectedIds[0]) : null
  useEffect(() => {
    if (pageOpen) return
    useDetailsStore.getState().syncTarget(sidebarId)
  }, [sidebarId, pageOpen])
  const clearRaw = rawSelection.clear
  useEffect(() => {
    if (pageOpen) return
    useDetailsStore.getState().setClearSelection(clearRaw)
    return () => useDetailsStore.getState().setClearSelection(null)
  }, [clearRaw, pageOpen])

  // The sidebar can ask for mockups to be selected once the grid has reloaded (Disband pile).
  const selectIds = rawSelection.set
  useEffect(() => {
    const pending = useDetailEffects.getState().takePendingSelection()
    if (pending.length > 0) selectIds(pending.map(String))
  }, [items, selectIds])

  const searching = query.trim() !== ''
  const filterCount = tagFilter.length + categoryIds.length
  const filtering = filterCount > 0

  const state: MockupGridState =
    !loaded && !failed
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
  // Read the store, not this render's values: a popover action can fire several toggles in a row.
  const onToggleCategory = (categoryId: number) => {
    const category = tagCategories.find((c) => c.categoryId === categoryId)
    const current = useLibraryStore.getState()
    const next = toggleCategory(
      { tagIds: current.tagFilter, categoryIds: current.categoryIds },
      categoryId,
      category?.tags.map((tag) => tag.tagId) ?? []
    )
    setTagFilter(next.tagIds)
    setCategoryIds(next.categoryIds)
  }

  const actions = useLibraryActions({
    starredOnly,
    refresh,
    keepLingering,
    releaseLingering,
    clearSelection: rawSelection.clear
  })
  const { openInPhotoshop } = actions

  const itemById = (id: string) => items.find((item) => String(item.id) === id)
  const selectedItems = selection.selectedIds
    .map(itemById)
    .filter((item): item is LibraryItem => item !== undefined)
  const cardOf = (target: EventTarget | null) =>
    (target as Element | null)?.closest<HTMLElement>('[data-mockup-id]') ?? null
  const itemOf = (target: EventTarget | null) => {
    const id = cardOf(target)?.dataset.mockupId
    return id === undefined ? undefined : itemById(id)
  }

  // ⋯ and right-click open the same menu; right-click selects the card first, like Finder.
  const [menu, setMenu] = useState<{ target: MenuTarget; at: { x: number; y: number } } | null>(
    null
  )
  const targetFor = (item: LibraryItem): MenuTarget =>
    selection.isSelected(String(item.id)) && selection.count > 1
      ? { kind: 'selection', items: selectedItems }
      : item.pile
        ? { kind: 'pile', item }
        : { kind: 'card', item }
  const openMenuFor = (item: LibraryItem, at: { x: number; y: number }) => {
    if (!selection.isSelected(String(item.id))) selection.select(String(item.id))
    setMenu({ target: targetFor(item), at })
  }
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const at = { x: event.clientX, y: event.clientY }
    const item = itemOf(event.target)
    if (item) openMenuFor(item, at)
    else {
      selection.clear()
      setMenu({ target: { kind: 'space' }, at })
    }
  }

  // The details sidebar: a pile opens its page, a mockup opens in the sidebar (as fields for Edit details).
  const openPileFor = (item: LibraryItem, edit = false) =>
    useDetailsStore.getState().guard(() =>
      useDetailsStore.getState().openPile({
        id: item.id,
        title: item.title,
        count: item.pile?.memberCount ?? 1,
        select: item.id,
        edit
      })
    )
  const editDetails = (item: LibraryItem) => {
    if (item.pile) return openPileFor(item, true)
    useDetailsStore.getState().guard(() => {
      useDetailsStore.getState().requestEdit(item.id)
      rawSelection.set([String(item.id)])
    })
  }

  const piles = useLibraryPiles({ refresh, offerUndo: actions.offerUndo })
  const newPile = (targets: LibraryItem[]) => {
    const intent = planNewPile(targets)
    if (intent) void piles.run(intent)
  }
  useShortcut({
    id: 'library.new-pile',
    combo: 'mod+g',
    scope: 'grid',
    handler: () => newPile(selectedItems)
  })
  useShortcut({
    id: 'library.disband',
    combo: 'mod+shift+g',
    scope: 'grid',
    handler: () => void piles.disband(pilesIn(selectedItems))
  })

  // Dragging: a card (or the whole selection, when the card is in it) dropped on a card.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [drag, setDrag] = useState<{ items: LibraryItem[]; overId: string | null } | null>(null)
  const onDragStart = (event: DragStartEvent) =>
    setDrag({
      items: draggedItems(items, selection.selectedIds, Number(event.active.id)),
      overId: null
    })
  const onDragOver = (event: DragOverEvent) =>
    setDrag((current) =>
      current ? { ...current, overId: event.over ? String(event.over.id) : null } : current
    )
  const onDragEnd = (event: DragEndEvent) => {
    const dragged = drag?.items ?? []
    setDrag(null)
    const target = event.over ? itemById(String(event.over.id)) : undefined
    if (!target) return
    const intent = planDrop(dragged, target)
    if (intent) void piles.run(intent)
  }
  const draggedIds = new Set((drag?.items ?? []).map((i) => String(i.id)))

  const trashSelection = () => void actions.trash(selectedItems)
  useShortcut({ id: 'library.trash', combo: 'backspace', scope: 'grid', handler: trashSelection })
  useShortcut({
    id: 'library.trash-cmd',
    combo: 'mod+backspace',
    scope: 'grid',
    handler: trashSelection
  })

  // Enter on a focused card: a pile opens its page, a mockup opens in the sidebar. Buttons inside a card keep their own keys.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const card = cardOf(event.target)
    if (!card || card !== event.target) return
    const item = itemOf(card)
    if (!item) return
    if (event.key === 'Enter') {
      event.preventDefault()
      if (item.pile) openPileFor(item)
      else selection.select(String(item.id))
    }
  }

  // Double-click opens a pile's page. On a mockup on its own it does nothing more than selecting it.
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const item = itemOf(event.target)
    if (item?.pile) openPileFor(item)
  }
  // A marquee press keeps focus where it was; pull it into the grid so its shortcuts apply.
  const onMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    const grid = event.currentTarget
    if (!grid.contains(document.activeElement)) grid.focus({ focusVisible: false })
  }

  const menuActions = {
    openInPhotoshop: (item: LibraryItem) => void openInPhotoshop(item),
    editDetails,
    openPile: (item: LibraryItem) => openPileFor(item),
    star: (targets: LibraryItem[], favourite: boolean) =>
      void actions.setFavouriteFor(targets, favourite),
    trash: (targets: LibraryItem[]) => void actions.trash(targets),
    newPile,
    disband: (item: LibraryItem) => void piles.disband([item]),
    selectAll: selection.selectAll,
    undo: () => void actions.undoLast(),
    ...(onAddFiles ? { addFiles: onAddFiles } : {}),
    ...(onAddFolder ? { addFolder: onAddFolder } : {})
  }

  const addCard = <AddCardMenu onAddFiles={onAddFiles} onAddFolder={onAddFolder} />

  const copy = noResultsCopy({ query, filterCount, starred: starredOnly })
  const goToAll = () => useUiStore.getState().setView('all')
  const clearAction =
    !searching && !filtering && starredOnly
      ? goToAll
      : searching && filtering
        ? () => {
            setQuery('')
            clearFilters()
          }
        : searching
          ? () => setQuery('')
          : clearFilters

  const total = stats.total
  // The header carries the count of the view and of a search or filter; the toolbar only says what is picked.
  const statsText = selection.count > 0 ? `${selection.count} of ${total} selected` : ''

  // The pile page is a view inside My Stash, over the same state.
  if (pageOpen) return <PilePage key={pageOpen.id} pile={pageOpen} />

  return (
    <div className="flex min-h-full flex-col gap-4">
      {onSortWaiting && showAdd && <WaitingToSortStrip onSort={onSortWaiting} />}
      {/*
        Stays put while the grid scrolls. The wrapper paints the panel colour and reaches over the
        scroller's 8px padding (-top-2, -mx-2), so cards slide under it and nothing shows above it.
      */}
      <div
        data-slot="library-toolbar-sticky"
        className="sticky -top-2 z-20 -mx-2 bg-surface-1 px-2 pt-2 pb-2"
      >
        <LibraryToolbar
          className="flex-wrap"
          stats={statsText}
          chips={chips}
          disabled={state === 'empty'}
          onClearFilters={clearFilters}
          sort={sort}
          onSortChange={setSort}
          tagFilter={{
            categories: tagCategories,
            selectedTagIds: tagFilter,
            onSelectedTagIdsChange: setTagFilter,
            pickedCategoryIds: categoryIds,
            onToggleCategory,
            onClearAll: clearFilters,
            onManageTags: () => openSettings('tags')
          }}
        />
      </div>
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
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <MockupGrid
          state={state}
          showAdd={showAdd}
          selection={selection}
          addCard={addCard}
          data-shortcut-scope="grid"
          tabIndex={-1}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          onMouseUp={onMouseUp}
          noResults={
            <EmptyState
              variant="page"
              icon={starredOnly && !searching && !filtering ? StarIcon : Search02Icon}
              title={copy.title}
              description={copy.description}
              primaryLabel={copy.clearLabel}
              primaryIcon={!searching && !filtering && starredOnly ? ArrowLeft01Icon : Cancel01Icon}
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
          {items.map((item) => {
            const key = String(item.id)
            const target = drag !== null && drag.overId === key && !draggedIds.has(key)
            return (
              <LibraryCard
                key={item.id}
                dndId={key}
                mockupId={key}
                title={item.title}
                tags={cardTags(item)}
                {...(item.coverPath ? { coverSrc: coverUrl(item.coverPath) } : {})}
                pile={item.pile}
                favourite={item.favourite}
                state={
                  draggedIds.has(key)
                    ? 'left-behind'
                    : target
                      ? 'group-target'
                      : coverDisplay(item, selection.isSelected(key))
                }
                {...(target ? { dropHint: dropHint(drag.items, item) } : {})}
                onToggleFavourite={(favourite) => void actions.setFavouriteFor([item], favourite)}
                onMore={(event) => {
                  const box = event.currentTarget.getBoundingClientRect()
                  openMenuFor(item, { x: box.left, y: box.bottom })
                }}
                onOpenInPhotoshop={() => void openInPhotoshop(item)}
                onEditDetails={() => editDetails(item)}
              />
            )
          })}
        </MockupGrid>
        {state === 'empty' && (
          <p className="type-body-sm-regular text-muted-foreground">
            Add PSDs or zips with the card, or drop them anywhere in this window.
          </p>
        )}
        <DragOverlay dropAnimation={null}>
          {drag && drag.items[0] && (
            <div className="relative w-card">
              {drag.items.length > 1 && (
                <>
                  <div className="absolute inset-0 rotate-3 rounded-xl bg-surface-3" />
                  <div className="absolute inset-0 -rotate-3 rounded-xl bg-surface-4" />
                </>
              )}
              <CoverImage
                size="md"
                {...(drag.items[0].coverPath ? { src: coverUrl(drag.items[0].coverPath) } : {})}
                className="relative"
              />
              {drag.items.length > 1 && (
                <Badge className="absolute top-2 right-2">{drag.items.length}</Badge>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <CardMenu
        target={menu?.target ?? null}
        at={menu?.at ?? { x: 0, y: 0 }}
        onClose={() => setMenu(null)}
        actions={menuActions}
        lastUndo={actions.lastUndo}
      />
    </div>
  )
}
