import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Delete02Icon, UndoIcon } from '@hugeicons/core-free-icons'
import { IPC_CHANNELS } from '@shared/ipc'
import type { TrashItem, TrashStats } from '@shared/inbox'
import { ActionBar } from '@renderer/components/ActionBar'
import { Banner } from '@renderer/components/Banner'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { DropdownMenu } from '@renderer/components/DropdownMenu/DropdownMenu'
import { DropdownMenuItem } from '@renderer/components/DropdownMenuItem/DropdownMenuItem'
import { EmptyState } from '@renderer/components/EmptyState'
import { ErrorState } from '@renderer/components/ErrorState'
import { MockupCard } from '@renderer/components/MockupCard'
import type { MockupCardState } from '@renderer/components/MockupCard/MockupCard.types'
import { MockupGrid } from '@renderer/components/MockupGrid'
import type { MockupGridState } from '@renderer/components/MockupGrid/MockupGrid.types'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import { agoText, formatBytes, newestFirst, pluralise } from '@renderer/lib/inbox-list'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { toast, undoToast } from '@renderer/stores/toastStore'

type Ask =
  | { kind: 'delete'; items: TrashItem[] }
  | { kind: 'empty'; stats: TrashStats }
  | { kind: 'missing'; items: TrashItem[] }

function cardState(item: TrashItem, selected: boolean): MockupCardState {
  if (item.coverMissing) return 'cover-missing'
  if (item.coverSource === 'none') return 'no-preview'
  return selected ? 'selected' : 'default'
}

/**
 * Trash: the My Stash grid without the Add card. Restore is instant with Undo; deleting for good
 * and emptying ask once. Figma: ↳ Inboxes & Trash › E · Trash. Rules: design/specs/inboxes.md.
 */
export default function TrashPage() {
  const items = useInboxStore((s) => s.trash)
  const setTrash = useInboxStore((s) => s.setTrash)
  const failed = useInboxStore((s) => s.failed.trash)
  const setFailed = useInboxStore((s) => s.setFailed)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [working, setWorking] = useState(false)
  const [menu, setMenu] = useState<{ item: TrashItem; at: { x: number; y: number } } | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.api.invoke(IPC_CHANNELS.TRASH_LIST, undefined)
    if (res.success) {
      setTrash(newestFirst(res.data.items))
      setFailed('trash', false)
    } else setFailed('trash', true)
  }, [setTrash, setFailed])
  useEffect(() => void refresh(), [refresh])

  const ids = useMemo(() => (items ?? []).map((item) => String(item.id)), [items])
  const selection = useGridSelection(ids)
  const byId = (id: string) => items?.find((item) => String(item.id) === id)
  const selected = selection.selectedIds
    .map(byId)
    .filter((item): item is TrashItem => item !== undefined)

  const state: MockupGridState =
    items === null
      ? failed
        ? 'error'
        : 'loading'
      : items.length === 0
        ? 'no-results'
        : 'populated'
  const loading = state === 'loading'

  /** Puts these back, with Undo. PSDs that are gone stay in Trash and ask what to do. */
  const restore = async (targets: TrashItem[] | 'all') => {
    const res =
      targets === 'all'
        ? await window.api.invoke(IPC_CHANNELS.TRASH_RESTORE_ALL, undefined)
        : await window.api.invoke(IPC_CHANNELS.TRASH_RESTORE, { ids: targets.map((t) => t.id) })
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t restore that. Try again.' })
      return
    }
    const { restoredIds, missing } = res.data
    selection.clear()
    await refresh()
    if (restoredIds.length > 0) {
      undoToast(
        'Restored to My Stash',
        () =>
          void (async () => {
            await window.api.invoke(IPC_CHANNELS.MOCKUP_TRASH, { ids: restoredIds })
            await refresh()
          })(),
        pluralise(restoredIds.length, 'item', 'items')
      )
    }
    if (missing.length > 0) {
      const gone = useInboxStore.getState().trash?.filter((t) => missing.includes(t.id)) ?? []
      setAsk({ kind: 'missing', items: gone })
    }
  }

  const deleteEntries = async (targets: TrashItem[]) => {
    setWorking(true)
    const res = await window.api.invoke(IPC_CHANNELS.TRASH_DELETE_ENTRY, {
      ids: targets.map((t) => t.id)
    })
    setWorking(false)
    setAsk(null)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t delete that. Try again.' })
      return
    }
    selection.clear()
    await refresh()
    toast({
      variant: 'success',
      message: `Deleted ${pluralise(targets.length, 'item', 'items')} for good`
    })
  }

  const askEmpty = async () => {
    const res = await window.api.invoke(IPC_CHANNELS.TRASH_STATS, undefined)
    if (res.success) setAsk({ kind: 'empty', stats: res.data })
    else toast({ variant: 'error', message: 'Couldn’t check Trash. Try again.' })
  }

  const empty = async () => {
    setWorking(true)
    const res = await window.api.invoke(IPC_CHANNELS.TRASH_EMPTY, undefined)
    setWorking(false)
    setAsk(null)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t empty Trash. Try again.' })
      return
    }
    selection.clear()
    await refresh()
    toast({
      variant: 'success',
      message: 'Trash emptied',
      description: `${pluralise(res.data.deletedCount, 'item', 'items')} gone, ${formatBytes(res.data.bytesFreed)} freed`
    })
  }

  // A card acts on the whole selection when it is part of a multi-selection, like My Stash.
  const targetsFor = (item: TrashItem) =>
    selection.isSelected(String(item.id)) && selected.length > 1 ? selected : [item]
  const cardOf = (target: EventTarget | null) =>
    (target as Element | null)?.closest<HTMLElement>('[data-mockup-id]') ?? null
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const id = cardOf(event.target)?.dataset.mockupId
    const item = id === undefined ? undefined : byId(id)
    if (!item) return
    event.preventDefault()
    if (!selection.isSelected(id!)) selection.select(id!)
    setMenu({ item, at: { x: event.clientX, y: event.clientY } })
  }

  const menuTargets = menu ? targetsFor(menu.item) : []
  const n = menuTargets.length

  const missingTitle =
    ask?.kind === 'missing'
      ? ask.items.length === 1
        ? `“${ask.items[0]?.title ?? 'This one'}” can’t come back`
        : `${ask.items.length} items can’t come back`
      : ''

  return (
    <div className="flex min-h-full flex-col gap-4 p-6">
      {failed && items !== null && (
        <Banner
          tone="error"
          title="Couldn’t refresh Trash"
          message="Showing what was here a moment ago."
          action
          actionLabel="Try again"
          onAction={() => void refresh()}
          dismissible={false}
        />
      )}
      <MockupGrid
        state={state}
        showAdd={false}
        selection={selection}
        data-shortcut-scope="grid"
        tabIndex={-1}
        onContextMenu={onContextMenu}
        noResults={
          <EmptyState
            variant="page"
            icon={Delete02Icon}
            title="Trash is empty"
            description="Things you move to Trash wait here until you delete them for good."
            primaryLabel={null}
          />
        }
        error={
          <ErrorState
            variant="page"
            title="Couldn’t load Trash"
            message="Try again in a moment."
            onRetry={() => void refresh()}
            secondaryLabel={null}
          />
        }
      >
        {(items ?? []).map((item) => {
          const key = String(item.id)
          return (
            <MockupCard
              key={item.id}
              mockupId={key}
              variant="trash"
              title={item.title}
              trashedAgo={agoText(item.trashedAt)}
              {...(item.coverPath ? { coverSrc: `file://${item.coverPath}` } : {})}
              variantCount={item.variantCount}
              state={cardState(item, selection.isSelected(key))}
              onRestore={() => void restore(targetsFor(item))}
              onDeleteForever={() => setAsk({ kind: 'delete', items: targetsFor(item) })}
            />
          )
        })}
      </MockupGrid>
      {(state === 'populated' || loading) && (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-surface-1 px-6 pt-2 pb-6">
          <ActionBar
            variant="page"
            cancelLabel="Empty Trash"
            cancelDisabled={loading}
            onCancel={() => void askEmpty()}
            primaryLabel={selected.length > 0 ? `Restore ${selected.length}` : 'Restore all'}
            primaryDisabled={loading}
            onPrimary={() => void restore(selected.length > 0 ? selected : 'all')}
          />
        </div>
      )}

      <DropdownMenu
        open={menu !== null}
        onOpenChange={(next) => !next && setMenu(null)}
        align="start"
        trigger={
          <span
            aria-hidden
            data-grid-ignore
            className="pointer-events-none fixed size-0"
            style={{ left: menu?.at.x ?? 0, top: menu?.at.y ?? 0 }}
          />
        }
        items={
          <>
            <DropdownMenuItem
              label={n > 1 ? `Restore ${n}` : 'Restore'}
              icon={UndoIcon}
              showShortcut={false}
              onSelect={() => void restore(menuTargets)}
            />
            <DropdownMenuItem
              label={n > 1 ? `Delete ${n} for good` : 'Delete for good'}
              icon={Delete02Icon}
              variant="destructive"
              showShortcut={false}
              onSelect={() => setAsk({ kind: 'delete', items: menuTargets })}
            />
          </>
        }
      />

      <ConfirmDialog
        open={ask?.kind === 'delete'}
        variant="destructive"
        working={working}
        detail={ask?.kind === 'delete'}
        title={
          ask?.kind === 'delete' && ask.items.length === 1
            ? 'Delete this for good?'
            : `Delete ${ask?.kind === 'delete' ? ask.items.length : 0} items for good?`
        }
        description="This can’t be undone."
        detailTitle={ask?.kind === 'delete' ? (ask.items[0]?.title ?? '') : ''}
        detailMeta={
          ask?.kind === 'delete'
            ? `${ask.items.length > 1 ? `${ask.items.length} items · ` : ''}${formatBytes(ask.items.reduce((sum, i) => sum + i.sizeBytes, 0))}`
            : ''
        }
        confirmLabel="Delete for good"
        workingLabel="Deleting…"
        onCancel={() => setAsk(null)}
        onConfirm={() => ask?.kind === 'delete' && void deleteEntries(ask.items)}
      />
      <ConfirmDialog
        open={ask?.kind === 'empty'}
        variant="destructive"
        working={working}
        detail={false}
        title="Empty Trash?"
        description={
          ask?.kind === 'empty'
            ? `${pluralise(ask.stats.count, 'item', 'items')} will be deleted for good, freeing ${formatBytes(ask.stats.bytes)}. This can’t be undone.`
            : ''
        }
        confirmLabel="Empty Trash"
        workingLabel="Emptying…"
        onCancel={() => setAsk(null)}
        onConfirm={() => void empty()}
      />
      <ConfirmDialog
        open={ask?.kind === 'missing'}
        variant="destructive"
        working={working}
        detail={false}
        title={missingTitle}
        description="The PSD is gone from your stash folder. You can keep the entry in Trash or delete it."
        confirmLabel="Delete entry"
        cancelLabel="Keep in Trash"
        workingLabel="Deleting…"
        onCancel={() => setAsk(null)}
        onConfirm={() => ask?.kind === 'missing' && void deleteEntries(ask.items)}
      />
    </div>
  )
}
