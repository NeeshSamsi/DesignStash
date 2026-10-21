import { cleanArchiveName } from '../../src/main/import/archive-name'

/** Longest id, cut at a word break so ids stay readable in gold data and file names. */
const MAX_ID = 48

/** A name as an id: plain ASCII words joined by `-`, at most `MAX_ID` characters. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_ID) return slug
  const cut = slug.slice(0, MAX_ID + 1)
  const lastBreak = cut.lastIndexOf('-')
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : slug.slice(0, MAX_ID)).replace(/-+$/, '')
}

export interface IdSource {
  fileName: string
  /** The dropped zip's file name, for a PSD inside a zip. */
  zip?: string
}

/**
 * Stable short ids for the items, in the order given (the eval sorts by source path first, so the
 * same test set always gives the same ids). Each comes from the PSD's cleaned file name; when that
 * says nothing (`Mockup.psd`) the zip's cleaned name is used, and when neither does (`011.zip`
 * holding `011.psd`), the bare file name. Repeats get `-2`, `-3`.
 */
export function itemIds(items: IdSource[]): string[] {
  const used = new Set<string>()
  return items.map((item) => {
    const named =
      cleanArchiveName(item.fileName) ??
      (item.zip ? cleanArchiveName(item.zip) : null) ??
      item.fileName.replace(/\.psd$/i, '')
    const base = slugify(named) || 'item'
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  })
}
