import { extname, join } from 'node:path'
import type { Readable } from 'node:stream'
import yauzl from 'yauzl'
import type { Entry, ExtraField } from 'yauzl'
import { entrySegments } from './archive-name'

/** One entry in a zip, read from its central directory. Nothing is extracted to list it. */
export interface ArchiveEntry {
  /** The path inside the zip, folders split by `/`. A label only: never used as a path on disk. */
  name: string
  /** Uncompressed size in bytes. */
  size: number
  encrypted: boolean
  directory: boolean
}

/** What an entry is to the importer: a PSD to copy, a zip to look inside, packaging, or anything else. */
export type EntryKind = 'psd' | 'zip' | 'junk' | 'other'

/** `zip` can be read. `unsupported` is an archive the person has to unzip first. */
export function archiveKindOf(path: string): 'zip' | 'unsupported' | null {
  const ext = extname(path).toLowerCase()
  if (ext === '.zip') return 'zip'
  if (ext === '.rar' || ext === '.7z') return 'unsupported'
  return null
}

const UTF8_FLAG = 0x800
const UNICODE_PATH_FIELD = 0x7075
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

/**
 * An entry's name as a person would read it. A UTF-8 flag or Info-ZIP Unicode path field is trusted.
 * Without either, bytes that are valid UTF-8 are read as UTF-8: many zip tools store names that way
 * without setting the flag, and CP437 text is almost never valid UTF-8 by accident. Anything else is CP437.
 */
export function decodeEntryName(
  generalPurposeBitFlag: number,
  raw: Buffer,
  extraFields: ExtraField[]
): string {
  const flagged =
    (generalPurposeBitFlag & UTF8_FLAG) !== 0 ||
    extraFields.some((f) => f.id === UNICODE_PATH_FIELD)
  if (!flagged) {
    try {
      return strictUtf8.decode(raw).replace(/\\/g, '/')
    } catch {
      // Not UTF-8, so CP437 below.
    }
  }
  return yauzl.getFileNameLowLevel(generalPurposeBitFlag, raw, extraFields, false)
}

// Names are decoded here rather than by yauzl, which fails the whole zip on one odd name.
const OPEN_OPTIONS = { decodeStrings: false, autoClose: false, validateEntrySizes: true } as const

function toArchiveEntry(entry: Entry): ArchiveEntry {
  const name = decodeEntryName(entry.generalPurposeBitFlag, entry.fileNameRaw, entry.extraFields)
  return {
    name,
    size: entry.uncompressedSize,
    encrypted: entry.isEncrypted(),
    directory: name.endsWith('/')
  }
}

/** Every entry in the zip, in the order its central directory lists them. */
export async function listArchive(zipPath: string): Promise<ArchiveEntry[]> {
  const zip = await yauzl.openPromise(zipPath, OPEN_OPTIONS)
  try {
    const entries: ArchiveEntry[] = []
    for await (const entry of zip.eachEntry()) entries.push(toArchiveEntry(entry))
    return entries
  } finally {
    zip.close()
  }
}

/**
 * Stream one entry's contents, found by its decoded name. The stream errors if the entry expands past
 * its declared size, so a zip bomb stops at the size the disk check allowed for. The zip itself is only read.
 */
export async function openArchiveEntry(zipPath: string, entryName: string): Promise<Readable> {
  const zip = await yauzl.openPromise(zipPath, OPEN_OPTIONS)
  try {
    for await (const entry of zip.eachEntry()) {
      const found = toArchiveEntry(entry)
      if (found.directory || found.name !== entryName) continue
      if (found.encrypted) throw new Error('The entry is encrypted')
      return await zip.openReadStreamPromise(entry)
    }
    throw Object.assign(new Error('No such entry in the zip'), { code: 'ENTRY_MISSING' })
  } finally {
    // yauzl keeps the file open until the stream it handed out has ended.
    zip.close()
  }
}

/**
 * Where a PSD inside a zip came from, as one path: the zip, then the entry. A label for sorting and
 * sidecar matching, never opened or written; `..` and a leading `/` in the entry cannot climb out of it.
 */
export function entryPath(zipPath: string, entryName: string): string {
  return join(zipPath, ...entrySegments(entryName))
}

const JUNK_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

/** Sort an entry by what the importer does with it. */
export function classifyEntry(entry: Pick<ArchiveEntry, 'name' | 'directory'>): EntryKind {
  if (entry.directory) return 'junk'
  const parts = entry.name.split('/')
  const base = parts.at(-1) ?? ''
  if (parts[0] === '__MACOSX' || base.startsWith('._') || JUNK_NAMES.has(base.toLowerCase()))
    return 'junk'
  const ext = extname(base).toLowerCase()
  if (ext === '.psd') return 'psd'
  if (ext === '.zip') return 'zip'
  return 'other'
}
