import type { DriftReport } from '@shared/integrity'
import { ReconciliationPanel } from '@renderer/components/ReconciliationPanel'
import { DialogDescription, DialogFrame, DialogTitle } from '@renderer/lib/dialog-shell'
import { useStashCheck } from './useStashCheck'

export interface StashCheckModalProps {
  /** What the launch check already found. Without it the modal checks first, with skeleton rows. */
  report?: DriftReport | undefined
  onClose: () => void
  onOpenSettings: () => void
}

/**
 * The stash check's changes (Figma ↳ Integrity › G1). Blocking: Esc and outside clicks do nothing,
 * and there is no ✕, so it closes only with Done once every change is resolved.
 * Rules: design/specs/settings.md, "Stash check: resolving changes".
 */
export function StashCheckModal({ report, onClose, onOpenSettings }: StashCheckModalProps) {
  const check = useStashCheck({ initial: report, onFailed: onClose, onOpenSettings })
  return (
    <DialogFrame
      open
      blocking
      dataDs="StashCheckModal"
      className="w-160 max-w-viewport gap-0 overflow-visible border-0 bg-transparent p-0"
    >
      <DialogTitle className="sr-only">Stash check</DialogTitle>
      <DialogDescription className="sr-only">
        Changes found in your stash folder. Resolve them to carry on.
      </DialogDescription>
      <ReconciliationPanel
        state={check.state}
        found={check.found}
        gone={check.gone}
        {...(check.resolvingId ? { resolvingId: check.resolvingId } : {})}
        onAdd={check.add}
        onAddAll={check.addAll}
        onIgnore={check.ignore}
        onIgnoreAll={check.ignoreAll}
        onRemove={check.remove}
        onRemoveAll={check.removeAll}
        onRelink={check.relink}
        onDone={onClose}
      />
    </DialogFrame>
  )
}
