import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { coverDisplay, type LibraryItem } from '@shared/library'
import { coverUrl } from '@shared/cover-url'
import { Button } from '@renderer/components/Button'
import { ErrorState } from '@renderer/components/ErrorState'
import { MockupGrid } from '@renderer/components/MockupGrid'
import { MockupCard } from '@renderer/components/MockupCard'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { HeaderActions } from '@renderer/lib/page-header-slot'
import { useDetailsStore, type OpenPile } from '@renderer/stores/detailsStore'
import { toast, undoToast } from '@renderer/stores/toastStore'
import { syncLibrary } from '../details/library-sync'
import { disbandPile, putOnTop, removeFromPile } from '../details/pile-actions'
import { itemName } from '@renderer/lib/item-title'
import { useGuardedSelection } from '../details/use-guarded-selection'
import { CardMenu, type MenuTarget } from './CardMenu'
import { openInPhotoshop } from './open-in-photoshop'
import { usePileItems } from './usePileItems'

const cardTags = (item: LibraryItem, isTop: boolean) =>
  [isTop ? 'Top' : null, ...item.tags.slice(0, 3).map((tag) => tag.label)]
    .filter((part): part is string => part !== null)
    .join(' · ')

/**
 * The pile page (Figma D2.3 C2): a view inside My Stash that lists one pile's mockups as full cards.
 * The top mockup is selected on arrival and the details sidebar shows it; a mockup clicked in the
 * pile sidebar arrives selected instead. Esc closes the sidebar first, then goes back (see
 * `useDetailsEscape`). Make top and the other pile actions live in each card's ⋯ menu.
 */
export function PilePage({ pile }: { pile: OpenPile }) {
  const { status, gone, items, topId, reload } = usePileItems(pile.id)
  const ids = useMemo(() => items.map((item) => String(item.id)), [items])
  const raw = useGridSelection(ids)
  const selection = useGuardedSelection(raw)
  const [menu, setMenu] = useState<{ target: MenuTarget; at: { x: number; y: number } } | null>(
    null
  )

  // Arrive on the chosen mockup, as fields when that was asked for.
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current || status !== 'ready') return
    arrived.current = true
    const first = items.some((item) => item.id === pile.select) ? pile.select : items[0]?.id
    if (first === undefined) return
    if (pile.edit) useDetailsStore.getState().requestEdit(first)
    raw.set([String(first)])
  }, [status, items, pile.select, pile.edit, raw])

  // The pile is gone (undone into something else, or disbanded elsewhere): back to My Stash.
  useEffect(() => {
    if (gone) useDetailsStore.getState().closePile()
  }, [gone])

  // The header follows the pile: its title is the top mockup's, and its count can change.
  useEffect(() => {
    const top = items.find((item) => item.id === topId)
    if (status === 'ready' && top)
      useDetailsStore.getState().updatePile({ title: top.title, count: items.length })
  }, [status, items, topId])

  // The sidebar follows the selection: one mockup shows, none closes it.
  const sidebarId = raw.count === 1 ? Number(raw.selectedIds[0]) : null
  useEffect(() => {
    if (!arrived.current) return
    useDetailsStore.getState().syncTarget(sidebarId)
  }, [sidebarId])
  useEffect(() => {
    useDetailsStore.getState().setClearSelection(raw.clear)
    return () => useDetailsStore.getState().setClearSelection(null)
  }, [raw.clear])

  const itemById = (id: string) => items.find((item) => String(item.id) === id)
  const cardOf = (target: EventTarget | null) =>
    (target as Element | null)?.closest<HTMLElement>('[data-mockup-id]') ?? null
  const itemOf = (target: EventTarget | null) => {
    const id = cardOf(target)?.dataset.mockupId
    return id === undefined ? undefined : itemById(id)
  }

  const setFavourite = async (item: LibraryItem, favourite: boolean) => {
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_SET_FAVOURITE, { mockupId: item.id, favourite })
      .catch(() => null)
    if (res?.success) void syncLibrary()
    else toast({ variant: 'error', message: 'Couldn’t update the star. Try again.' })
  }

  const editDetails = (item: LibraryItem) =>
    useDetailsStore.getState().guard(() => {
      useDetailsStore.getState().requestEdit(item.id)
      raw.set([String(item.id)])
    })

  const trash = async (item: LibraryItem) => {
    const res = await window.api
      .invoke(IPC_CHANNELS.MOCKUP_TRASH, { ids: [item.id] })
      .catch(() => null)
    if (!res?.success || !res.data.ok) {
      toast({ variant: 'error', message: 'Couldn’t move that to Trash. Try again.' })
      return
    }
    raw.clear()
    await reload()
    void syncLibrary()
    undoToast(
      'Moved to Trash',
      () => {
        void window.api
          .invoke(IPC_CHANNELS.MOCKUP_RESTORE, { ids: [item.id] })
          .then(() => Promise.all([reload(), syncLibrary()]))
      },
      itemName(item)
    )
  }

  const makeTop = async (item: LibraryItem) => {
    const next = await putOnTop(pile.id, item.id, itemName(item))
    if (next === null) return
    // The pile is now the new top's row: carry on with that id.
    useDetailsStore.getState().openPile({ ...pile, id: next, select: item.id, edit: false })
  }

  const removeItem = async (item: LibraryItem) => {
    const result = await removeFromPile(pile.id, item.id, itemName(item))
    if (!result) return
    // A pile left with one mockup is gone: back to My Stash. A new top carries on as the pile.
    if (result.pileId === null) useDetailsStore.getState().closePile()
    else if (result.pileId !== pile.id)
      useDetailsStore
        .getState()
        .openPile({ ...pile, id: result.pileId, select: result.pileId, edit: false })
  }

  const disband = async () => {
    if (await disbandPile(pile.id)) useDetailsStore.getState().closePile()
  }
  const editPile = () => {
    if (topId === null) return
    useDetailsStore.getState().guard(() => {
      useDetailsStore.getState().requestEdit(topId)
      raw.set([String(topId)])
    })
  }

  const openMenuFor = (item: LibraryItem, at: { x: number; y: number }) => {
    if (!raw.isSelected(String(item.id))) selection.select(String(item.id))
    setMenu({ target: { kind: 'card', item, inPile: { isTop: item.id === topId } }, at })
  }
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const item = itemOf(event.target)
    if (item) openMenuFor(item, { x: event.clientX, y: event.clientY })
  }
  // Enter on a focused card shows it in the sidebar.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    const card = cardOf(event.target)
    if (!card || card !== event.target || event.key !== 'Enter') return
    const item = itemOf(card)
    if (!item) return
    event.preventDefault()
    selection.select(String(item.id))
  }
  const onMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    const grid = event.currentTarget
    if (!grid.contains(document.activeElement)) grid.focus({ focusVisible: false })
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <HeaderActions>
        <Button
          variant="outline-subtle"
          size="sm"
          label="Disband pile"
          onClick={() => void disband()}
        />
        <Button variant="secondary" size="sm" label="Edit pile details" onClick={editPile} />
      </HeaderActions>
      {status === 'error' ? (
        <ErrorState
          variant="page"
          title="Couldn’t open this pile"
          message="Try again in a moment."
          onRetry={() => void reload()}
          secondaryLabel={null}
        />
      ) : (
        <MockupGrid
          state={status === 'loading' ? 'loading' : 'populated'}
          showAdd={false}
          selection={selection}
          data-shortcut-scope="grid"
          tabIndex={-1}
          onContextMenu={onContextMenu}
          onKeyDown={onKeyDown}
          onMouseUp={onMouseUp}
        >
          {items.map((item) => {
            const key = String(item.id)
            return (
              <MockupCard
                key={item.id}
                mockupId={key}
                title={itemName(item)}
                tags={cardTags(item, item.id === topId)}
                {...(item.coverPath ? { coverSrc: coverUrl(item.coverPath) } : {})}
                favourite={item.favourite}
                state={coverDisplay(item, raw.isSelected(key))}
                onToggleFavourite={(favourite) => void setFavourite(item, favourite)}
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
      )}
      <CardMenu
        target={menu?.target ?? null}
        at={menu?.at ?? { x: 0, y: 0 }}
        onClose={() => setMenu(null)}
        lastUndo={null}
        actions={{
          openInPhotoshop: (item) => void openInPhotoshop(item),
          editDetails,
          star: (targets, favourite) =>
            targets.forEach((item) => void setFavourite(item, favourite)),
          putOnTop: (item) => void makeTop(item),
          removeFromPile: (item) => void removeItem(item),
          trash: (targets) => targets.forEach((item) => void trash(item)),
          selectAll: selection.selectAll,
          undo: () => {}
        }}
      />
    </div>
  )
}
