import { CopyFileRow } from '@renderer/components/CopyFileRow'
import { CopyWidget } from '@renderer/components/CopyWidget'
import { useAutoDismiss } from '@renderer/hooks/use-auto-dismiss'
import { SUMMARY_MS } from '@renderer/lib/dock'
import { useCopyStore } from '@renderer/stores/copyStore'
import {
  filePercent,
  remainingText,
  rowDetail,
  rowState,
  widgetCopy,
  widgetState
} from './gather-model'
import type { useGather } from './useGather'

export interface GatherDockProps {
  gather: ReturnType<typeof useGather>
}

/**
 * The copy widget for the haul on show, bottom-right in the ActivityDock. Cancel stops the copy and
 * the widget then asks to keep what landed or undo it all (Figma G3.E4); done collapses to a summary.
 */
export function GatherDock({ gather }: GatherDockProps) {
  const view = useCopyStore((s) => s.view)
  const toggleView = useCopyStore((s) => s.toggleView)
  const dismiss = useCopyStore((s) => s.dismiss)
  const flowOpen = useCopyStore((s) => s.flowOpen)
  const { haul } = gather
  const state = haul ? widgetState(haul) : null
  // A finished copy is a success message: it stays about as long as a toast, and hovering holds it.
  // One that left a file unreadable stays until it is dismissed, so the failure is not missed.
  const hover = useAutoDismiss(
    state === 'done' && haul?.skipped.unreadable === 0,
    SUMMARY_MS,
    dismiss
  )
  if (!haul || !state) return null
  // Never over a flow modal: the summary waits (or times out) underneath.
  if (flowOpen && state === 'done') return null
  const copy = widgetCopy(haul)

  return (
    <CopyWidget
      view={view}
      {...hover}
      state={state}
      title={copy.title}
      {...(copy.description ? { description: copy.description } : {})}
      percent={copy.percent}
      remaining={remainingText(haul)}
      keepCount={haul.landed}
      files={haul.files.map((file) => {
        const detail = rowDetail(file, haul)
        return (
          <CopyFileRow
            key={file.jobId}
            state={rowState(file)}
            name={file.name}
            percent={filePercent(file)}
            {...(detail ? { detail } : {})}
          />
        )
      })}
      onToggleView={toggleView}
      onCancel={() => void gather.cancel()}
      onKeep={gather.keep}
      onUndoAll={() => void gather.undoAll()}
      onRetry={() => void gather.retry()}
      onDismiss={dismiss}
    />
  )
}
