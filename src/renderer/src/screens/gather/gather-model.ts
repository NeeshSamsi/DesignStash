import type { CopyFile, CopyStatus } from '@shared/ipc/import'
import type { CopyFileRowState } from '@renderer/components/CopyFileRow/CopyFileRow.types'
import type { CopyWidgetState } from '@renderer/components/CopyWidget/CopyWidget.types'
import type { AppView } from '@renderer/stores/uiStore'
import { formatBytes } from '../settings/settings-copy'

/** Pure rules for Gather: what the widget says, what a drag means, what a drop becomes. */

import { formatCount, mockups } from '@renderer/lib/plural'

/**
 * Files that were looked at: landed, or left out as a duplicate or unreadable. Not-PSDs never count,
 * and neither do archives left whole: they are in `total` as rows of their own, so they count here.
 */
export function processed(haul: CopyStatus): number {
  return (
    haul.landed +
    haul.skipped.duplicate +
    haul.skipped.unreadable +
    haul.skipped.archiveUnsupported +
    haul.skipped.noPsdInArchive
  )
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
  return (
    haul.skipped.notPsd +
    haul.skipped.duplicate +
    haul.skipped.unreadable +
    haul.skipped.archiveUnsupported +
    haul.skipped.noPsdInArchive
  )
}

/** How far along, 0 to 100. Counted in bytes, so one big PSD moves the bar as it copies; by files only when sizes are unknown. */
export function overallPercent(haul: CopyStatus): number {
  if (haul.bytesTotal > 0) {
    return Math.min(100, Math.floor((haul.bytesCopied / haul.bytesTotal) * 100))
  }
  return haul.total > 0 ? Math.min(100, Math.round((processed(haul) / haul.total) * 100)) : 0
}

/** One file's own progress, 0 to 100. */
export function filePercent(file: CopyFile): number {
  if (file.status === 'done') return 100
  if (!file.size || !file.bytesCopied) return 0
  return Math.min(100, Math.floor((file.bytesCopied / file.size) * 100))
}

/** "About 2 min left", in steps that don't flicker. Empty until there is a measured speed. */
export function remainingText(haul: CopyStatus): string {
  const seconds = haul.secondsLeft
  if (haul.state !== 'running' || seconds === null) return ''
  if (seconds < 10) return 'A few seconds left'
  if (seconds <= 55) return `About ${Math.ceil(seconds / 5) * 5} seconds left`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `About ${minutes} min left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `About ${hours} hr left` : `About ${hours} hr ${rest} min left`
}

export interface WidgetCopy {
  title: string
  description?: string
  percent: number
}

/** The headline and the line under it, from Figma's CopyWidget states. */
export function widgetCopy(haul: CopyStatus): WidgetCopy {
  const percent = overallPercent(haul)
  const total = formatCount(haul.total)
  const count = `${formatCount(processed(haul))} of ${total}`
  const landed = formatCount(haul.landed)
  switch (widgetState(haul)) {
    case 'done': {
      const skipped = skippedTotal(haul)
      return {
        title:
          skipped > 0 ? `${landed} copied · ${formatCount(skipped)} skipped` : `${landed} copied`,
        percent: 100
      }
    }
    case 'stopped':
      return {
        title: `Copying stopped at ${count}`,
        description: `Keep the ${landed} that made it in, or undo all?`,
        percent
      }
    case 'error': {
      const gone = haul.state === 'paused' && haul.pauseReason === 'source-gone'
      const why = gone ? 'a drive was unplugged' : 'your disk is full'
      return {
        title: `Copying paused · ${why}`,
        description: `${
          gone ? 'Plug it back in' : 'Free up some space'
        }, then retry. The ${landed} already copied ${haul.landed === 1 ? 'is' : 'are'} safe in To sort.`,
        percent
      }
    }
    default:
      // Files that landed, so the number matches the rows marked Copied.
      return { title: `${landed} of ${total} copied`, percent }
  }
}

/**
 * The line under a file's name. A copied file says how big it was; a file still queued when the
 * copy was stopped never made it. Null leaves the row's plain sentence for the state.
 */
export function rowDetail(file: CopyFile, haul: CopyStatus): string | null {
  if (file.status === 'skipped') return SKIP_DETAIL[file.skipReason ?? 'unreadable'] ?? null
  // A PSD out of a zip keeps saying which zip it came from.
  const from = file.archiveName ? `From ${file.archiveName}` : null
  if (file.status === 'done') {
    // A file whose mockup was in Trash brought it back, and nothing new was copied.
    const done = file.restored
      ? 'Already in Trash · restored'
      : file.size
        ? `Copied · ${formatBytes(file.size)}`
        : 'Copied'
    return from ? `${done} · ${from}` : done
  }
  if (file.status === 'queued' && haul.state === 'cancelled') return 'Not copied'
  if (file.status === 'copying' && from) return `Unpacking… · ${from}`
  if (file.status === 'queued' && from) return from
  return null
}

/** The two archive reasons have their own sentence; the rest use the row's plain one. */
const SKIP_DETAIL: Partial<Record<NonNullable<CopyFile['skipReason']>, string>> = {
  'archive-unsupported': 'Unzip this one first',
  'no-psd-in-archive': 'No PSD inside'
}

/** One file's row: a skipped file shows why, a landed one shows done. */
export function rowState(file: CopyFile): CopyFileRowState {
  if (file.status === 'skipped') {
    // An archive left out shows as a not-PSD row; rowDetail words it.
    if (file.skipReason === 'archive-unsupported' || file.skipReason === 'no-psd-in-archive')
      return 'not-psd'
    return file.skipReason ?? 'unreadable'
  }
  return file.status
}

/** The toast after Undo all: the import went to Trash, where Restore (or Redo) brings it back. */
export function undoneMessage(removed: number): { message: string; description: string } {
  return {
    message: 'Copy undone',
    description: `${mockups(removed)} moved to Trash. Your originals weren’t touched.`
  }
}

/* ---- drops ---- */

/** Photoshop files and the archives main can open or explain (a .rar or .7z gets "Unzip this one first"). */
const PSD_TYPES = new Set([
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
  'image/x-photoshop',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed'
])

export interface DragItem {
  kind: string
  type: string
}

export type DragVerdict = 'ok' | 'rejected'

/**
 * While dragging only the item types are readable, not the names. A file with a known type that is
 * not Photoshop or an archive is certainly not a PSD; an unknown type (macOS often gives none for .psd, and a
 * folder has none) might be. The drag is rejected only when every file is certainly not a PSD.
 */
export function dragVerdict(items: readonly DragItem[]): DragVerdict {
  const files = items.filter((item) => item.kind === 'file')
  if (files.length === 0) return 'ok'
  return files.every((item) => item.type !== '' && !PSD_TYPES.has(item.type)) ? 'rejected' : 'ok'
}

const PSD_NAME = /\.(psd|psb|zip|rar|7z)$/i

export interface DroppedFile {
  name: string
  type: string
  /** Whether the drop said it is a folder. Unknown when the drop gave no entry for it. */
  directory?: boolean | undefined
}

/**
 * On drop the names are known. PSDs and archives are kept, and so are folders: main scans them.
 * A folder's name can have a dot in it ("Device Mockups 2.0"), so the drop's own word on what is a
 * folder wins. Without it, a name with no extension stands for a folder.
 */
export function keepDropped(files: readonly DroppedFile[]): number[] {
  const kept: number[] = []
  files.forEach((file, index) => {
    const folder = file.directory ?? !/\.[^./]+$/.test(file.name)
    if (PSD_NAME.test(file.name) || folder) kept.push(index)
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
      title: 'Those aren’t PSDs or zips',
      description: 'DesignStash only takes .psd and .zip files, so there’s nothing to add.'
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
          ? `They’ll join the ${mockups(input.waiting)} already waiting.`
          : 'They’ll wait here until you sort them.'
    }
  }
  return { state: 'drag-over', title: 'Drop PSDs or zips to add them' }
}
