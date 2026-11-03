import { dirname, join, relative, isAbsolute } from 'node:path'
import type { Repository } from '../db/repository'

/** True when `path` is the folder itself or sits inside it. */
export function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Remove the app's own copies of mockups: the PSD in the stash folder, its cover and the
 * thumbnail beside the cover. Anything outside the stash folder is left alone, so a toss or a
 * delete can never reach an original, whatever a record says.
 */
export async function removeAppCopies(
  libraryRoot: string,
  mockups: { libraryPath: string; coverPath: string }[],
  rm: (path: string) => Promise<void>
): Promise<void> {
  const paths = new Set<string>()
  for (const m of mockups) {
    paths.add(m.libraryPath)
    paths.add(m.coverPath)
    paths.add(join(dirname(m.coverPath), 'thumb.webp'))
  }
  for (const path of paths) {
    if (!isInside(libraryRoot, path)) continue
    try {
      await rm(path)
    } catch (err) {
      // Already gone is fine: the goal is that the copy isn't there.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
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
    const m = repo.getMockup(id)
    if (!m) continue
    if (m.sizeBytes !== null) {
      sizes.set(id, m.sizeBytes)
      continue
    }
    try {
      const { size } = await stat(m.libraryPath)
      repo.updateMockup(id, { sizeBytes: size })
      sizes.set(id, size)
    } catch {
      sizes.set(id, null)
    }
  }
  return sizes
}
