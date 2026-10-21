import { DropHint } from '@renderer/components/DropHint'
import { DropOverlay } from '@renderer/components/DropOverlay'
import { useInboxCounts } from '@renderer/hooks/use-inbox-counts'
import { toast } from '@renderer/stores/toastStore'
import { useUiStore } from '@renderer/stores/uiStore'
import { dropTarget, overlayFor } from './gather-model'
import type { useGather } from './useGather'
import { useWindowDrop } from './useWindowDrop'

/**
 * What a file drag shows and does: My Stash and To sort take the drop (DropOverlay), everywhere
 * else a DropHint follows the cursor. Returns the overlay for the window and the hint to render.
 */
export function useGatherDrops(gather: ReturnType<typeof useGather>) {
  const view = useUiStore((s) => s.view)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const modalOpen = useUiStore((s) => s.modal !== null)
  const inbox = useInboxCounts()
  const target = dropTarget(view, { settingsOpen, modalOpen })

  const drag = useWindowDrop({
    accepts: target !== 'none',
    getPath: (file) => window.api.getPathForFile(file),
    onDrop: (paths) => void gather.start(paths),
    onRejected: () =>
      toast({
        variant: 'error',
        message: 'Those aren’t PSDs or zips',
        description: 'DesignStash only takes .psd and .zip files, so there’s nothing to add.'
      })
  })

  const copy = drag.active
    ? overlayFor({
        target,
        verdict: drag.verdict,
        copying: gather.copying,
        count: drag.count,
        waiting: inbox?.toSort ?? 0
      })
    : null

  const overlay = copy && (
    <DropOverlay
      state={copy.state}
      {...(copy.title ? { title: copy.title } : {})}
      {...(copy.description ? { description: copy.description } : {})}
    />
  )
  const hint = drag.active && target === 'none' && (
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: drag.at.x + 16, top: drag.at.y + 16 }}
    >
      <DropHint />
    </div>
  )
  return { dragging: copy !== null, overlay, hint }
}
