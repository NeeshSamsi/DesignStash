import { createWriteStream, mkdirSync, promises as fs, type Dirent } from 'node:fs'
import { join, basename, sep, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { imagesNamedFor, isSidecarImage, leadsToFile } from '../psd/sidecar'
import { archiveKindOf, classifyEntry, entryPath, listArchive, openArchiveEntry } from './archive'
import type { ArchiveEntry } from './archive'
import { archiveFolderTrail } from './archive-name'
import { isPhotoshopFile } from '../psd/photoshop-file'

export interface ScannedPsd {
  /** The PSD on disk, or for a PSD inside a zip, the zip's path joined with the entry's (never opened as is). */
  psdPath: string
  /** Set when the PSD is inside a zip: where to read it from. */
  archive?: {
    /** The zip to open: the dropped one, or a staged copy of a zip inside it. */
    path: string
    /** The PSD's path inside that zip. */
    entry: string
    /** The dropped zip's file name, as dropped. */
    name: string
    /** Uncompressed size in bytes. */
    size: number
  }
  importContext: { originalFileName: string; folderTrail: string[] }
}

/**
 * Something in the drop that gave no PSDs and gets a row saying why: an archive left whole, or a
 * file or folder that couldn't be read (gone, locked, or a cloud file not on this Mac). Each counts once.
 */
export interface SkippedItem {
  path: string
  /** Its file or folder name, as dropped. */
  name: string
  reason: 'archive-unsupported' | 'no-psd-in-archive' | 'unreadable'
}

export interface ScanResult {
  psds: ScannedPsd[]
  skippedCount: number // non-.psd files encountered (files inside zips are packaging, not counted)
  skippedItems: SkippedItem[]
  candidateImagePaths: string[] // ALL sidecar-eligible images across the dropped folders (for M2 resolveCover)
}

export interface ScanOptions {
  /** Where a zip found inside a zip is copied out to so it can be read. Made only when needed. */
  stagingDir: string
}

type ZipScan = { psds: ScannedPsd[]; problem?: SkippedItem['reason'] }

export async function scanForPsds(droppedPaths: string[], opts: ScanOptions): Promise<ScanResult> {
  const result: ScanResult = {
    psds: [],
    skippedCount: 0,
    skippedItems: [],
    candidateImagePaths: []
  }

  const candidateImages = new Set<string>()
  const zips: { path: string; outerTrail: string[] }[] = []
  let staged = 0

  function trailOf(path: string, root: string): string[] {
    return (
      relative(root, path)
        .split(sep)
        .slice(0, -1)
        // a directly-dropped single file will have '..' as the first part, filter that out
        .filter((p) => p !== '..')
    )
  }

  const unreadable = (path: string): void => {
    result.skippedItems.push({ path, name: basename(path), reason: 'unreadable' })
  }

  function addFile(path: string, root: string) {
    const archive = archiveKindOf(path)
    if (isPhotoshopFile(path)) {
      result.psds.push({
        psdPath: path,
        importContext: {
          originalFileName: basename(path),
          folderTrail: trailOf(path, root)
        }
      })
    } else if (archive === 'zip') {
      zips.push({ path, outerTrail: trailOf(path, root) })
    } else if (archive === 'unsupported') {
      result.skippedItems.push({
        path,
        name: basename(path),
        reason: 'archive-unsupported'
      })
    } else {
      result.skippedCount++
    }
  }

  /**
   * A folder at a time, so a big drop never holds up the main thread, gathering its PSDs and the
   * images that could be their covers in the one pass. A folder it can't open is one unreadable row
   * and the rest of the drop carries on. A link is followed to a file, never to a folder, which could
   * lead back up the tree.
   */
  async function walk(dir: string, root: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      unreadable(dir)
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) await walk(fullPath, root)
      else if (entry.isFile() || (entry.isSymbolicLink() && (await leadsToFile(fullPath)))) {
        if (isSidecarImage(entry.name)) candidateImages.add(fullPath)
        addFile(fullPath, root)
      }
    }
  }

  /** Copy a zip found inside a zip out to staging, so it can be read like a dropped one. */
  async function stage(zipPath: string, entry: ArchiveEntry): Promise<string> {
    mkdirSync(opts.stagingDir, { recursive: true })
    const dest = join(opts.stagingDir, `${staged++}.zip`)
    await pipeline(await openArchiveEntry(zipPath, entry.name), createWriteStream(dest))
    return dest
  }

  /**
   * The PSDs in one zip. `names` and `entries` are the zips above it (a zip inside a zip has its
   * outer zip's name and entry first). Only the dropped zip is looked inside for further zips.
   */
  async function scanZip(
    zipPath: string,
    droppedName: string,
    names: string[],
    entries: string[],
    outerTrail: string[]
  ): Promise<ZipScan> {
    let listed: ArchiveEntry[]
    try {
      listed = await listArchive(zipPath)
    } catch {
      return { psds: [], problem: 'unreadable' }
    }
    const wanted = listed
      .map((e) => ({ entry: e, kind: classifyEntry(e) }))
      .filter((e) => e.kind === 'psd' || (e.kind === 'zip' && names.length === 1))
    if (wanted.some((e) => e.entry.encrypted)) return { psds: [], problem: 'archive-unsupported' }

    const psds: ScannedPsd[] = []
    let innerProblem: SkippedItem['reason'] | undefined
    for (const { entry, kind } of wanted) {
      if (kind === 'psd') {
        psds.push({
          psdPath: entryPath(zipPath, entry.name),
          archive: { path: zipPath, entry: entry.name, name: droppedName, size: entry.size },
          importContext: {
            originalFileName: basename(entry.name),
            folderTrail: archiveFolderTrail(names, [...entries, entry.name], outerTrail)
          }
        })
        continue
      }
      let stagedPath: string
      try {
        stagedPath = await stage(zipPath, entry)
      } catch {
        innerProblem ??= 'unreadable'
        continue
      }
      const inner = await scanZip(
        stagedPath,
        droppedName,
        [...names, basename(entry.name)],
        [...entries, entry.name],
        outerTrail
      )
      psds.push(...inner.psds)
      if (inner.problem) innerProblem ??= inner.problem
    }
    return psds.length > 0 ? { psds } : { psds, problem: innerProblem ?? 'no-psd-in-archive' }
  }

  for (const path of droppedPaths) {
    // Something dropped is gone, locked, or a cloud file not on this Mac: it gets its row, and the
    // rest of the drop lands.
    const stat = await fs.stat(path).catch(() => null)
    if (!stat || !(stat.isDirectory() || stat.isFile())) {
      unreadable(path)
      continue
    }
    // A dropped folder's own name starts its PSDs' trail ("Long Website Mockup / PSD"): it is often the
    // only name that says what they are. A dropped file's folder isn't part of the drop.
    const root = join(path, '..')
    // Cover images come from dropped folders, as they are walked. A dropped PSD gets only the images
    // beside it with its own name, so its folder (Downloads, say) isn't walked; nor is a dropped zip's.
    if (stat.isDirectory()) {
      await walk(path, root)
    } else {
      if (isPhotoshopFile(path)) {
        for (const imagePath of await imagesNamedFor(path)) candidateImages.add(imagePath)
      }
      addFile(path, root)
    }
  }

  for (const zip of zips) {
    const name = basename(zip.path)
    const scan = await scanZip(zip.path, name, [name], [], zip.outerTrail)
    result.psds.push(...scan.psds)
    if (scan.problem) result.skippedItems.push({ path: zip.path, name, reason: scan.problem })
  }

  result.candidateImagePaths = [...candidateImages]
  return result
}
