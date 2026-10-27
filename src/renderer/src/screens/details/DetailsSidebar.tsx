import { useEffect, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DiscardedEdit } from '@shared/ipc/undo'
import { setRendererUndo, useUndoRan } from '@renderer/lib/undo-router'
import { useDetailsStore, type DetailsTarget } from '@renderer/stores/detailsStore'
import { undoToast } from '@renderer/stores/toastStore'
import { currentEdit, discardEdit, restoreEdit } from './discarded-edit'
import { syncLibrary } from './library-sync'
import { PanelSurface } from './PanelSurface'
import { PileView } from './PileView'
import { SingleView } from './SingleView'
import { useDetailsData } from './use-details-data'

function Content({ target, onPile }: { target: DetailsTarget; onPile: boolean }) {
  const data = useDetailsData(target.id)
  const isPile = !onPile && (data.detail?.variants.length ?? 0) > 0 && data.detail?.item.pile
  if (isPile) return <PileView data={data} />
  const kind = onPile && data.detail?.item.pile ? 'top' : 'mockup'
  return <SingleView data={data} edit={target.edit} kind={kind} />
}

/**
 * DetailsSidebar — where a mockup or pile is seen and edited: its own surface to the right of the
 * page. It follows the page's selection. On the pile page every mockup, the top one too, shows as
 * one mockup. Rules: the build spec "Sidebar editing"; Figma D2.3 B1, B2, B3 and C2.
 */
export function DetailsSidebar({ open }: { open?: boolean } = {}) {
  const target = useDetailsStore((s) => s.target)
  const onPile = useDetailsStore((s) => s.pile !== null)
  // The content stays up while the panel leaves.
  const [shown, setShown] = useState<DetailsTarget | null>(target)
  if (target && target !== shown) setShown(target)
  const current = target ?? shown
  // An undo from the app's history (⌘Z, a toast's Undo) can change anything in the library: My
  // Stash, the pile page and this panel reload from the revision, and the counts refresh.
  useUndoRan(() => void syncLibrary())
  // Discard your changes is the one entry only the window can carry out: Undo puts the edits back,
  // Redo drops them again.
  useEffect(
    () =>
      setRendererUndo((op) =>
        op.kind === 'reopen-editor' ? restoreEdit(op.mockupId, op.values) : discardEdit(op.mockupId)
      ),
    []
  )
  return (
    <PanelSurface open={open ?? target !== null}>
      {current && <Content key={`${current.id}-${onPile}`} target={current} onPile={onPile} />}
    </PanelSurface>
  )
}

/**
 * Discard your changes, undoable (design/specs/undo.md): Esc, ✕, another card or Cancel with
 * unsaved edits throws them away at once, with no ask. The history keeps them
 * (undo:record-discard), so the toast's Undo, or ⌘Z, brings the fields back holding them.
 */
export function DiscardAsk() {
  const asking = useDetailsStore((s) => s.ask !== null)
  useEffect(() => {
    if (!asking) return
    const edit = currentEdit()
    useDetailsStore.getState().confirmDiscard()
    if (edit) void keepDiscarded(edit.mockupId, edit.values)
  }, [asking])
  return null
}

async function keepDiscarded(mockupId: number, values: DiscardedEdit) {
  const res = await window.api
    .invoke(IPC_CHANNELS.UNDO_RECORD_DISCARD, { mockupId, values })
    .catch(() => null)
  undoToast(
    'Discarded your changes',
    () => restoreEdit(mockupId, values),
    undefined,
    res?.success ? res.data.undoEntryId : undefined
  )
}
