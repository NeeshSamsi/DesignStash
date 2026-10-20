import type { CopyFile, CopyStatus } from '@shared/ipc/import'
import type { CopyFileRowState } from '@renderer/components/CopyFileRow/CopyFileRow.types'
import type { CopyWidgetState } from '@renderer/components/CopyWidget/CopyWidget.types'
import type { AppView } from '@renderer/stores/uiStore'

/** Pure rules for Gather: what the widget says, what a drag means, what a drop becomes. */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Files that were looked at: landed, or left out as a duplicate or unreadable (not-PSDs never count). */
export function processed(haul: CopyStatus): number {
  return haul.landed + haul.skipped.duplicate + haul.skipped.unreadable
}

export function widgetState(haul: CopyStatus): CopyWidgetState | null {
  switch (haul.state) {
    case 'running':
      return 'copying'
    case 'paused':
      return 'error'
    case 'done':
      return 'done'
    case 'cancelled':
      return 'stopped'
    case 'undone':
      return null
  }
}

export function skippedTotal(haul: CopyStatus): number {
  return haul.skipped.notPsd + haul.skipped.duplicate + haul.skipped.unreadable
}

export interface WidgetCopy {
  title: string
  description?: string
  percent: number
}

/** The headline and the line under it, from Figma's CopyWidget states. */
export function widgetCopy(haul: CopyStatus): WidgetCopy {
  const done = processed(haul)
  const percent = haul.total > 0 ? Math.min(100, Math.round((done / haul.total) * 100)) : 0
  const count = `${done} of ${haul.total}`
  switch (widgetState(haul)) {
    case 'done': {
      const skipped = skippedTotal(haul)
      return {
        title: skipped > 0 ? `${haul.landed} copied · ${skipped} skipped` : `${haul.landed} copied`,
        percent: 100
      }
    }
    case 'stopped':
      return {
        title: `Copying stopped at ${count}`,
        description: `Keep the ${haul.landed} that made it in, or undo all?`,
        percent
      }
    case 'error': {
      const why = haul.pauseReason === 'source-gone' ? 'a drive was unplugged' : 'your disk is full'
      return {
        title: `Copying paused · ${why}`,
        description: `${
          haul.pauseReason === 'source-gone' ? 'Plug it back in' : 'Free up some space'
        }, then retry. The ${haul.landed} already copied ${haul.landed === 1 ? 'is' : 'are'} safe in To sort.`,
        percent
      }
    }
    default:
      return { title: `Copying ${count}`, percent }
  }
}

/** One file's row: a skipped file shows why, a landed one shows done. */
export function rowState(file: CopyFile): CopyFileRowState {
  if (file.status === 'skipped') return file.skipReason ?? 'unreadable'
  return file.status
}

/** The toast after Undo all. */
export function undoneMessage(removed: number): { message: string; description: string } {
  return {
    message: 'Copy undone',
    description: `${plural(removed, 'mockup', 'mockups')} removed from To sort. Your originals weren’t touched.`
  }
}

/* ---- drops ---- */

const PSD_TYPES = new Set([
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
  'image/x-photoshop'
])

export interface DragItem {
  kind: string
  type: string
}

export type DragVerdict = 'ok' | 'rejected'

/**
 * While dragging only the item types are readable, not the names. A file with a known type that is
 * not Photoshop is certainly not a PSD; an unknown type (macOS often gives none for .psd, and a
 * folder has none) might be. The drag is rejected only when every file is certainly not a PSD.
 */
export function dragVerdict(items: readonly DragItem[]): DragVerdict {
  const files = items.filter((item) => item.kind === 'file')
  if (files.length === 0) return 'ok'
  return files.every((item) => item.type !== '' && !PSD_TYPES.has(item.type)) ? 'rejected' : 'ok'
}

const PSD_NAME = /\.(psd|psb)$/i

/** On drop the names are known. Folders have no extension and are kept: main scans them. */
export function keepDropped(files: readonly { name: string; type: string }[]): number[] {
  const kept: number[] = []
  files.forEach((file, index) => {
    const hasExtension = /\.[^./]+$/.test(file.name)
    if (PSD_NAME.test(file.name) || !hasExtension) kept.push(index)
  })
  return kept
}

export type DropTarget = 'my-stash' | 'to-sort' | 'none'

/** My Stash (All and Starred) and To sort take drops. Every other page, and any open dialog, does not. */
export function dropTarget(
  view: AppView,
  blocked: { settingsOpen: boolean; modalOpen: boolean }
): DropTarget {
  if (blocked.settingsOpen || blocked.modalOpen) return 'none'
  if (view === 'all' || view === 'starred') return 'my-stash'
  if (view === 'to-sort') return 'to-sort'
  return 'none'
}

export interface OverlayCopy {
  state: 'drag-over' | 'rejected' | 'queued'
  title?: string
  description?: string
}

/** The window-wide overlay for a drag. Null where a DropHint shows instead. */
export function overlayFor(input: {
  target: DropTarget
  verdict: DragVerdict
  copying: boolean
  count: number
  waiting: number
}): OverlayCopy | null {
  if (input.target === 'none') return null
  if (input.verdict === 'rejected') {
    return {
      state: 'rejected',
      title: 'Those aren’t PSDs',
      description: 'DesignStash only takes .psd files, so there’s nothing to add.'
    }
  }
  if (input.copying) {
    return {
      state: 'queued',
      title: `Add ${input.count} more to the copy`,
      description: 'They join the files already copying, then land in To sort.'
    }
  }
  if (input.target === 'to-sort') {
    return {
      state: 'drag-over',
      title: 'Drop to add them to To sort',
      description:
        input.waiting > 0
          ? `They’ll join the ${plural(input.waiting, 'mockup', 'mockups')} already waiting.`
          : 'They’ll wait here until you sort them.'
    }
  }
  return { state: 'drag-over' }
}
