import { JUNK_WORDS } from '../ai/vision-provider'

/** Words a file or folder name carries that say nothing about the mockup. */
const FILLER = new Set([
  'scene',
  'copy',
  'final',
  'file',
  'files',
  'archive',
  'preview',
  'version',
  'zip',
  'folder',
  'new',
  'download',
  'export'
])

// The junk list is global-flagged, which makes `test` stateful; a copy without the flag is not.
const JUNK = new RegExp(JUNK_WORDS.source, 'i')

/** Words of one name: split at separators and camelCase, then the ids, numbers and junk dropped. */
function wordsOf(name: string): string[] {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/(?<=[a-z]{2})(?=[A-Z])/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1 && !/\d/.test(w) && !FILLER.has(w) && !JUNK.test(w))
}

/**
 * Hidden search words from where a mockup came from: its original file name (extension cut) and
 * its folder trail. Numbers, hashes, ids, junk words and filler are left out. Deduplicated.
 */
export function nameKeywords(fileName: string, folderTrail: readonly string[]): string[] {
  const stem = fileName.replace(/\.[a-z0-9]{2,5}$/i, '')
  return [...new Set([...wordsOf(stem), ...folderTrail.flatMap(wordsOf)])]
}
