import { useState } from 'react'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import { useDetailsStore, type DetailsTarget } from '@renderer/stores/detailsStore'
import { PanelSurface } from './PanelSurface'
import { PileView } from './PileView'
import { SingleView } from './SingleView'
import { useDetailsData } from './use-details-data'

function Content({ target, onPile }: { target: DetailsTarget; onPile: boolean }) {
  const data = useDetailsData(target.id)
  const isPile = !onPile && (data.detail?.variants.length ?? 0) > 0 && data.detail?.item.isGroup
  if (isPile) return <PileView data={data} />
  const kind = onPile && data.detail?.item.isGroup ? 'top' : 'mockup'
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
  return (
    <PanelSurface open={open ?? target !== null}>
      {current && <Content key={`${current.id}-${onPile}`} target={current} onPile={onPile} />}
    </PanelSurface>
  )
}

/** “Discard your changes?”: the ask behind Esc, ✕, another card and Cancel while there are unsaved edits. */
export function DiscardAsk() {
  const asking = useDetailsStore((s) => s.ask !== null)
  return (
    <ConfirmDialog
      open={asking}
      variant="destructive"
      detail={false}
      title="Discard your changes?"
      description="Your edits to this mockup won’t be saved."
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      onCancel={() => useDetailsStore.getState().keepEditing()}
      onConfirm={() => useDetailsStore.getState().confirmDiscard()}
    />
  )
}
