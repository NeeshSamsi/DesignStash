export type DragKind = 'image' | 'rejected' | 'none'

interface DragItem {
  kind: string
  type: string
}

interface DragData {
  types?: ArrayLike<string> | undefined
  items?: ArrayLike<DragItem> | undefined
}

/**
 * What is being dragged over a cover, read during dragenter/dragover, when browsers hide file
 * contents but still expose each item's kind and MIME type.
 * `image` = at least one image (or files whose type isn't known yet, which get the benefit of the doubt),
 * `rejected` = files, none of them images, `none` = not a file drag at all.
 */
export function classifyDrag(data: DragData | null | undefined): DragKind {
  if (!data) return 'none'
  const types = Array.from(data.types ?? [])
  const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file')
  if (!types.includes('Files') && items.length === 0) return 'none'
  if (items.length === 0) return 'image'
  const known = items.filter((item) => item.type !== '')
  if (known.length < items.length) return 'image'
  return known.some((item) => item.type.startsWith('image/')) ? 'image' : 'rejected'
}

/** Images on the clipboard, for ⌘V. */
export function clipboardFiles(
  data: { files?: ArrayLike<File> | undefined } | null | undefined
): File[] {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'))
}

/** True when a keystroke or paste is aimed at something the user is typing into. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
