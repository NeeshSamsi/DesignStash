/** An entry name's parts, without the `..`, `.` and empty parts a hostile or sloppy zip can hold. */
export function entrySegments(entryName: string): string[] {
  return entryName.split('/').filter((s) => s !== '' && s !== '.' && s !== '..')
}

/** Words that say nothing about a mockup on their own: a name made only of these is left out. */
const GENERIC_WORDS = new Set([
  'archive',
  'download',
  'downloads',
  'file',
  'files',
  'free',
  'mockup',
  'mockups',
  'psd',
  'psb'
])

/** A download site's random ID before the real name: 16 or more letters and digits, with at least one of each. */
const ID_PREFIX = /^(?=[a-z]*\d)(?=\d*[a-z])[a-z\d]{16,}[_-]+/i

/** A name as words: no extension, no ID prefix, `_` and `-` as spaces. Empty when nothing is left. */
function words(name: string): string {
  return name
    .trim()
    .replace(/\.zip$/i, '')
    .replace(/\.ps[db]$/i, '')
    .replace(ID_PREFIX, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function saysNothing(cleaned: string): boolean {
  if (cleaned === '' || /^\d+$/.test(cleaned)) return true
  return cleaned
    .toLowerCase()
    .split(' ')
    .every((w) => GENERIC_WORDS.has(w))
}

/**
 * A zip's file name as a person would say it: `y1PjyY3rTTWYuCfHXkQo_Tape-Mockup.zip` reads
 * "Tape Mockup". Null when what is left says nothing (`011.zip`, `…_Archive.zip`).
 */
export function cleanArchiveName(fileName: string): string | null {
  const cleaned = words(fileName)
  return saysNothing(cleaned) ? null : cleaned
}

/**
 * The folders a PSD inside a zip came from, outermost first: any folders before the zip, then each
 * zip's name and the folders inside it (a zip inside a zip adds a second level). Packaging folders
 * ("Files") and folders that repeat a name already in the trail are left out, so the zip's name is
 * what grouping and pile titles see.
 *
 * `archiveNames[i]` is the file name of the zip at level i; `entryNames[i]` is the path inside it
 * (the last part, the file itself, is not a folder).
 */
export function archiveFolderTrail(
  archiveNames: string[],
  entryNames: string[],
  outerTrail: string[] = []
): string[] {
  const trail = [...outerTrail]
  const seen = new Set(trail.map((t) => words(t).toLowerCase()))
  const add = (label: string, cleaned: string) => {
    const key = cleaned.toLowerCase()
    if (saysNothing(cleaned) || seen.has(key)) return
    seen.add(key)
    trail.push(label)
  }
  archiveNames.forEach((archiveName, level) => {
    const name = words(archiveName)
    add(name, name)
    const folders = entrySegments(entryNames[level] ?? '').slice(0, -1)
    for (const folder of folders) add(folder.trim(), words(folder))
  })
  return trail
}
