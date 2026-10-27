// How a pile on the Sort board is titled — design/specs/pile-titles.md. Pure and shared: the
// renderer re-titles live on every board edit, and main uses it when it builds the proposal.

/** What titling needs to know about a mockup in a pile. */
export interface PileTitleMember {
  fileName: string
  /** Folders the file came from, outermost first. */
  folderTrail: string[]
  /** The top mockup. When none is marked, the first member is the top. */
  isPrimary?: boolean
  /** The cleaned name of the zip it came out of, when that name says something. */
  archiveTitle?: string
}

export interface PileTitleOptions {
  /** The title of the pile's top mockup when it is already stashed (rule 0). */
  stashedTitle?: string | null
}

/**
 * The code keeps `leader` and `primary` as identifiers; people see "top mockup" and "Top".
 * `folder` is the only source that shows a folder icon.
 */
export type PileTitleSource = 'leader' | 'folder' | 'filename' | 'primary'

export interface PileTitle {
  title: string
  source: PileTitleSource
  /** Shown only when the title doesn't already explain the pile. */
  reason?: string
}

export const REASON_TOP_STASHED = 'top mockup stashed'
export const REASON_SIMILAR_NAMES = 'similar names'

/** Folder names that never become a title (compared case-insensitively). */
export const GENERIC_FOLDERS = [
  'desktop',
  'downloads',
  'documents',
  'mockups',
  'new folder',
  'untitled folder'
] as const

/** Filename starts that never become a title (compared case-insensitively). */
export const GENERIC_NAME_STARTS = [
  'img',
  'dsc',
  'untitled',
  'final',
  'copy',
  'artboard',
  'layer',
  'scan',
  'screenshot',
  'mockup'
] as const

const SEPARATORS = /[_\-\s]/
const MIN_START_CHARS = 3

export function isGenericFolder(name: string): boolean {
  return (GENERIC_FOLDERS as readonly string[]).includes(name.trim().toLowerCase())
}

/** True when the first word of a filename start is a camera or app default. */
export function isGenericNameStart(start: string): boolean {
  const firstWord = start.trim().split(SEPARATORS)[0]?.toLowerCase() ?? ''
  return (GENERIC_NAME_STARTS as readonly string[]).includes(firstWord)
}

const lastFolder = (member: PileTitleMember) =>
  member.folderTrail[member.folderTrail.length - 1]?.trim()

/** The zip every member came out of, by its cleaned name. */
function sharedArchive(members: PileTitleMember[]): string | undefined {
  const first = members[0]?.archiveTitle
  return first && members.every((m) => m.archiveTitle === first) ? first : undefined
}

function sharedFolder(members: PileTitleMember[]): string | undefined {
  const first = lastFolder(members[0]!)
  if (!first || isGenericFolder(first)) return undefined
  const same = members.every((m) => lastFolder(m)?.toLowerCase() === first.toLowerCase())
  return same ? first : undefined
}

/**
 * The longest start every filename shares, cut back to the last separator, in `top`'s spelling.
 * Undefined when it is too short or generic to mean the files belong together. The grouping
 * service uses the same test to keep a zip of similar names as one pile.
 */
export function sharedNameStart(
  members: Pick<PileTitleMember, 'fileName'>[],
  top: Pick<PileTitleMember, 'fileName'>
): string | undefined {
  const names = members.map((m) => m.fileName.toLowerCase())
  let length = 0
  while (names.every((n) => n.length > length && n[length] === names[0]![length])) length++
  const common = top.fileName.slice(0, length)
  let cut = common.length
  while (cut > 0 && !SEPARATORS.test(common[cut - 1]!)) cut--
  const start = common.slice(0, cut)
  if (start.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_START_CHARS) return undefined
  return isGenericNameStart(start) ? undefined : start
}

/** The title of a pile: the first rule that fits. See the spec for the rules and examples. */
export function pileTitle(members: PileTitleMember[], opts: PileTitleOptions = {}): PileTitle {
  const top = members.find((m) => m.isPrimary) ?? members[0]
  if (!top) return { title: '', source: 'primary' }

  if (opts.stashedTitle) {
    return { title: opts.stashedTitle, source: 'leader', reason: REASON_TOP_STASHED }
  }
  if (members.length > 1) {
    // A pile from one zip is named after the zip, shown like a folder.
    const archive = sharedArchive(members)
    if (archive) return { title: archive, source: 'folder' }
    const folder = sharedFolder(members)
    if (folder) return { title: folder, source: 'folder' }
    const start = sharedNameStart(members, top)
    if (start) return { title: `${start}…`, source: 'filename', reason: REASON_SIMILAR_NAMES }
  }
  return { title: top.fileName, source: 'primary' }
}
