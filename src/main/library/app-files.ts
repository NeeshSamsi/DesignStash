import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, isAbsolute } from 'node:path'
import type { Repository } from '../db/repository'

/** True when `path` is the folder itself or sits inside it. */
export function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Removing files: one file, a folder's names (none when it is missing), and a folder once empty. */
export interface AppFileOps {
  rm: (path: string) => Promise<void>
  readdir: (dir: string) => Promise<string[]>
  /** Fails when the folder still holds anything, which leaves it. */
  rmdir: (dir: string) => Promise<void>
}

export const defaultAppFileOps: AppFileOps = {
  rm: (p) => fs.rm(p, { force: true }),
  readdir: (d) => fs.readdir(d).catch(() => []),
  rmdir: (d) => fs.rmdir(d)
}

/** What the app writes beside a cover: its thumbnail, the design slot mask and the AI's masked covers. */
const BESIDE_COVER = /^(thumb\.webp|slot-mask\.(?:png|none)|cover-ai-[\w-]+\.png)$/i
/** Every name the app gives a file in a folder of its own: the PSD's copy, covers and the files beside them. */
const APP_FILE = /^(original\.psd|cover\.\w+|thumb\.webp|slot-mask\.(?:png|none)|cover-ai-[\w-]+\.png)$/i

/**
 * Remove the app's own files for mockups deleted for good: the PSD's copy in the stash folder, its
 * cover, and what the app wrote beside them (thumbnail, slot-mask.png, cover-ai-*.png). The folders
 * the app made for a mockup go too: `mockups/<id>/` from an import and every `covers/<mockup id>-…/`
 * from replacing its cover. In those, only app-named files are removed and the folder only once it
 * is empty, so a file someone put there survives, and a folder another record still points into
 * (in Trash too) is left alone. Call it after the records are deleted. Anything outside the stash
 * folder is never touched, so a toss or a delete can never reach an original, whatever a record says.
 * `keepPsd` keeps the PSD, for a mockup the Stash check added where it already was.
 */
export async function removeAppCopies(
  repo: Repository,
  libraryRoot: string,
  removed: { id: number; libraryPath: string; coverPath: string }[],
  ops: AppFileOps,
  opts: { keepPsd?: boolean } = {}
): Promise<void> {
  const others = repo.mockups.getAllFilePaths()
  const usedByOthers = (folder: string) =>
    others.some(
      (o) =>
        isInside(folder, o.libraryPath) || (o.coverPath !== '' && isInside(folder, o.coverPath))
    )
  const mockupsDir = join(libraryRoot, 'mockups')
  const coversDir = join(libraryRoot, 'covers')
  const coverFolders = await ops.readdir(coversDir)

  const doomed = new Set<string>()
  const keep = new Set<string>()
  const folders: string[] = []
  for (const m of removed) {
    if (opts.keepPsd) keep.add(m.libraryPath)
    doomed.add(m.libraryPath)
    if (m.coverPath && !others.some((o) => o.coverPath === m.coverPath)) {
      doomed.add(m.coverPath)
      const beside = dirname(m.coverPath)
      if (!usedByOthers(beside)) {
        for (const name of await ops.readdir(beside))
          if (BESIDE_COVER.test(name)) doomed.add(join(beside, name))
      }
    }
    // The app's own folders for this mockup: the import's, and its cover folders.
    const own = [
      ...(dirname(dirname(m.libraryPath)) === mockupsDir &&
      basename(m.libraryPath) === 'original.psd'
        ? [dirname(m.libraryPath)]
        : []),
      ...coverFolders
        .filter((name) => name.startsWith(`${m.id}-`))
        .map((name) => join(coversDir, name))
    ]
    for (const folder of own) {
      if (usedByOthers(folder)) continue
      for (const name of await ops.readdir(folder))
        if (APP_FILE.test(name)) doomed.add(join(folder, name))
      folders.push(folder)
    }
  }

  for (const path of doomed) {
    if (keep.has(path) || !isInside(libraryRoot, path) || path === libraryRoot) continue
    try {
      await ops.rm(path)
    } catch (err) {
      // Already gone is fine: the goal is that the copy isn't there.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  for (const folder of folders) {
    if (!isInside(libraryRoot, folder)) continue
    // Not empty (someone's own file, or a kept PSD) or already gone: it stays as it is.
    await ops.rmdir(folder).catch(() => {})
  }
}

/**
 * Measure the PSD of each mockup that has no size yet and remember it. A file that can't be read
 * stays unmeasured. Returns the sizes by id.
 */
export async function ensureSizes(
  repo: Repository,
  stat: (path: string) => Promise<{ size: number }>,
  ids: number[]
): Promise<Map<number, number | null>> {
  const sizes = new Map<number, number | null>()
  for (const id of ids) {
    const m = repo.mockups.getMockup(id)
    if (!m) continue
    if (m.sizeBytes !== null) {
      sizes.set(id, m.sizeBytes)
      continue
    }
    try {
      const { size } = await stat(m.libraryPath)
      repo.mockups.updateMockup(id, { sizeBytes: size })
      sizes.set(id, size)
    } catch {
      sizes.set(id, null)
    }
  }
  return sizes
}
