import { useMemo, useState } from 'react'
import { FileAddIcon, Layers01Icon } from '@hugeicons/core-free-icons'
import { IPC_CHANNELS } from '@shared/ipc'
import type { InboxItem, InboxStage } from '@shared/inbox'
import { ActionBar } from '@renderer/components/ActionBar'
import { Banner } from '@renderer/components/Banner'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { EmptyState } from '@renderer/components/EmptyState'
import { ErrorState } from '@renderer/components/ErrorState'
import { MockupCard } from '@renderer/components/MockupCard'
import { MockupGrid } from '@renderer/components/MockupGrid'
import type { MockupGridState } from '@renderer/components/MockupGrid/MockupGrid.types'
import { useGridSelection } from '@renderer/hooks/use-grid-selection'
import {
  aiTotals,
  pluralise,
  sniffingBadge,
  sniffingLine,
  tossCopy,
  verbFor
} from '@renderer/lib/inbox-list'
import { HeaderActions, useHeaderStatus } from '@renderer/lib/page-header-slot'
import { useInboxStore } from '@renderer/stores/inboxStore'
import { toast } from '@renderer/stores/toastStore'
import { AddCardMenu } from '../gather/AddCardMenu'
import { useInboxList } from './useInboxList'
import { coverUrl } from '@shared/cover-url'
import { coverDisplay } from '@shared/library'

export interface InboxPageProps {
  stage: InboxStage
  /** Opens the Sort board (To sort) for these cards: the selection, or all of them. */
  onSort?: (items: InboxItem[]) => void
  /** Opens the legacy approval stepper (To stash) for these cards, until Look it over lands. */
  onLookOver?: (items: InboxItem[]) => void
  /** The import entry points behind the Add card (and the empty page's button). */
  onAddFiles?: () => void
  onAddFolder?: () => void
}

/**
 * To sort and To stash: the My Stash grid, cards and selection with an action bar underneath.
 * Figma: ↳ Inboxes & Trash › I1 · To sort, I2 · To stash. Rules: design/specs/inboxes.md.
 */
export default function InboxPage({
  stage,
  onSort,
  onLookOver,
  onAddFiles,
  onAddFolder
}: InboxPageProps) {
  const toSortPage = stage === 'to_sort'
  const { items, failed, refresh } = useInboxList(stage)
  const pushedTotals = useInboxStore((s) => s.aiTotals)

  const ids = useMemo(() => (items ?? []).map((item) => String(item.id)), [items])
  const selection = useGridSelection(ids)
  const byId = (id: string) => items?.find((item) => String(item.id) === id)
  const selected = selection.selectedIds
    .map(byId)
    .filter((item): item is InboxItem => item !== undefined)
  const targets = selected.length > 0 ? selected : (items ?? [])

  const [tossing, setTossing] = useState<InboxItem[] | null>(null)
  const [working, setWorking] = useState(false)
  const state: MockupGridState =
    items === null
      ? failed
        ? 'error'
        : 'loading'
      : items.length === 0
        ? 'no-results'
        : 'populated'

  const toss = async (list: InboxItem[]) => {
    setWorking(true)
    const res = await window.api.invoke(IPC_CHANNELS.INBOX_TOSS, { ids: list.map((i) => i.id) })
    setWorking(false)
    setTossing(null)
    if (!res.success) {
      toast({ variant: 'error', message: 'Couldn’t toss those. Try again.' })
      return
    }
    selection.clear()
    await refresh()
    const n = res.data.tossedIds.length
    toast({ variant: 'success', message: `Tossed ${pluralise(n, 'mockup', 'mockups')}` })
  }

  // Both inboxes start with the Add card, as in Figma I1.1 and I2.1.
  const addCard = <AddCardMenu onAddFiles={onAddFiles} onAddFolder={onAddFolder} />

  const tossText = tossing ? tossCopy(stage, tossing) : null

  const line = toSortPage ? sniffingLine(aiTotals(items ?? [], pushedTotals)) : undefined
  useHeaderStatus(state === 'populated' ? line : undefined)
  const primary = toSortPage
    ? verbFor('Sort', selected.length)
    : selected.length > 0
      ? `Look over ${selected.length}`
      : 'Look them over'
  const empty = toSortPage
    ? {
        title: 'Nothing waiting to be sorted',
        description: 'Mockups you add land here first, so you can sort them into piles.',
        label: 'Add mockups'
      }
    : {
        title: 'Nothing waiting to be stashed',
        description: 'Sorted piles and mockups wait here until you look them over.',
        label: null
      }

  return (
    <div className="flex min-h-full flex-col gap-4">
      {failed && items !== null && (
        <Banner
          tone="error"
          title="Couldn’t refresh this page"
          message="Showing what was here a moment ago."
          action
          actionLabel="Try again"
          onAction={() => void refresh()}
          dismissible={false}
        />
      )}
      <MockupGrid
        state={state}
        showAdd
        addCard={addCard}
        selection={selection}
        data-shortcut-scope="grid"
        tabIndex={-1}
        noResults={
          <EmptyState
            variant="page"
            icon={toSortPage ? Layers01Icon : FileAddIcon}
            title={empty.title}
            description={empty.description}
            primaryLabel={toSortPage && onAddFiles ? empty.label : null}
            primaryIcon={FileAddIcon}
            {...(onAddFiles ? { onPrimary: onAddFiles } : {})}
          />
        }
        error={
          <ErrorState
            variant="page"
            title="Couldn’t load this page"
            message="Try again in a moment."
            onRetry={() => void refresh()}
            secondaryLabel={null}
          />
        }
      >
        {(items ?? []).map((item) => {
          const key = String(item.id)
          const badge = toSortPage ? sniffingBadge(item.aiStatus) : undefined
          return (
            <MockupCard
              key={item.id}
              mockupId={key}
              variant="pending-review"
              title={item.title}
              titleIsFileName={toSortPage}
              {...(item.coverPath ? { coverSrc: coverUrl(item.coverPath) } : {})}
              variantCount={item.variantCount}
              showStatus={badge !== undefined}
              {...(badge ? { status: badge } : {})}
              state={coverDisplay(item, selection.isSelected(key))}
              {...(!toSortPage && onLookOver ? { onLookItOver: () => onLookOver([item]) } : {})}
            />
          )
        })}
      </MockupGrid>
      {state === 'populated' && (
        <HeaderActions>
          <ActionBar
            variant="page"
            showStatus={false}
            cancelLabel={
              selected.length > 0
                ? `Toss ${selected.length}`
                : toSortPage
                  ? 'Toss this haul'
                  : 'Toss these'
            }
            onCancel={() => setTossing(targets)}
            primaryLabel={primary}
            onPrimary={() => (toSortPage ? onSort?.(targets) : onLookOver?.(targets))}
          />
        </HeaderActions>
      )}
      <ConfirmDialog
        open={tossing !== null}
        variant="destructive"
        working={working}
        detail={tossText?.detailTitle !== undefined}
        title={tossText?.title ?? ''}
        description={tossText?.description ?? ''}
        detailTitle={tossText?.detailTitle ?? ''}
        detailMeta={tossText?.detailMeta ?? ''}
        confirmLabel={tossText?.confirmLabel ?? 'Discard'}
        workingLabel="Discarding…"
        cancelLabel="Cancel"
        onCancel={() => setTossing(null)}
        onConfirm={() => tossing && void toss(tossing)}
      />
    </div>
  )
}
