import { createWriteStream, mkdirSync, readdirSync, statSync } from 'node:fs'
import { extname, join, basename, sep, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { collectCandidateImages } from '../psd'
import { archiveKindOf, classifyEntry, entryPath, listArchive, openArchiveEntry } from './archive'
import type { ArchiveEntry } from './archive'
import { archiveFolderTrail } from './archive-name'

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

/** A dropped archive that gave no PSDs. Each counts once. */
export interface SkippedArchive {
  path: string
  /** Its file name, as dropped. */
  name: string
  reason: 'archive-unsupported' | 'no-psd-in-archive' | 'unreadable'
}

export interface ScanResult {
  psds: ScannedPsd[]
  skippedCount: number // non-.psd files encountered (files inside zips are packaging, not counted)
  skippedArchives: SkippedArchive[]
  candidateImagePaths: string[] // ALL sidecar-eligible images across the dropped folders (for M2 resolveCover)
}

export interface ScanOptions {
  /** Where a zip found inside a zip is copied out to so it can be read. Made only when needed. */
  stagingDir: string
}

type ZipScan = { psds: ScannedPsd[]; problem?: SkippedArchive['reason'] }

export async function scanForPsds(droppedPaths: string[], opts: ScanOptions): Promise<ScanResult> {
  const result: ScanResult = {
    psds: [],
    skippedCount: 0,
    skippedArchives: [],
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

  function recurse(path: string, root: string) {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(path, entry.name)
        recurse(fullPath, root)
      }
    } else if (stat.isFile()) {
      const archive = archiveKindOf(path)
      if (extname(path).toLowerCase() === '.psd') {
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
        result.skippedArchives.push({
          path,
          name: basename(path),
          reason: 'archive-unsupported'
        })
      } else {
        result.skippedCount++
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
    let innerProblem: SkippedArchive['reason'] | undefined
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
    const stat = statSync(path)
    // Cover images come from dropped folders. A dropped zip's own folder is not walked.
    if (stat.isDirectory() || archiveKindOf(path) === null) {
      const root = stat.isDirectory() ? path : join(path, '..')
      for (const imagePath of collectCandidateImages(root)) {
        candidateImages.add(imagePath)
      }
    }
    recurse(path, stat.isDirectory() ? path : join(path, '..'))
  }

  for (const zip of zips) {
    const name = basename(zip.path)
    const scan = await scanZip(zip.path, name, [name], [], zip.outerTrail)
    result.psds.push(...scan.psds)
    if (scan.problem) result.skippedArchives.push({ path: zip.path, name, reason: scan.problem })
  }

  result.candidateImagePaths = [...candidateImages]
  return result
}
