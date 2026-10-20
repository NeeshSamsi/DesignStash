import { CopyFileRow } from '@renderer/components/CopyFileRow'
import { CopyWidget } from '@renderer/components/CopyWidget'
import { useCopyStore } from '@renderer/stores/copyStore'
import { rowState, widgetCopy, widgetState } from './gather-model'
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
  const { haul } = gather
  const state = haul ? widgetState(haul) : null
  if (!haul || !state) return null
  const copy = widgetCopy(haul)

  return (
    <CopyWidget
      view={view}
      state={state}
      title={copy.title}
      {...(copy.description ? { description: copy.description } : {})}
      percent={copy.percent}
      remaining=""
      keepCount={haul.landed}
      files={haul.files.map((file) => (
        <CopyFileRow key={file.jobId} state={rowState(file)} name={file.name} />
      ))}
      onToggleView={toggleView}
      onCancel={() => void gather.cancel()}
      onKeep={gather.keep}
      onUndoAll={() => void gather.undoAll()}
      onRetry={() => void gather.retry()}
      onDismiss={dismiss}
    />
  )
}
