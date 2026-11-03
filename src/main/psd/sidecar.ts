import { promises as fs, readdirSync, statSync } from 'node:fs'
import { join, extname, basename, dirname } from 'node:path'
import { SIDECAR_EXTENSIONS, SIDECAR_FUZZY_THRESHOLD } from '@shared/constants'

/** An image file that could be a PSD's cover, by its name. */
export const isSidecarImage = (name: string): boolean =>
  SIDECAR_EXTENSIONS.includes(extname(name).toLowerCase())

/** Whether a path, or the link at it, leads to a file. */
export async function leadsToFile(path: string): Promise<boolean> {
  return fs.stat(path).then((s) => s.isFile(), () => false)
}

/** Every image under a folder that could be a cover, for scripts. The app gathers them as it walks a drop (scanner.ts). */
export function collectCandidateImages(rootDir: string): string[] {
  const results: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        walk(full)
      } else if (isSidecarImage(entry)) {
        results.push(full)
      }
    }
  }
  walk(rootDir)
  return results
}

/** The images in a PSD's own folder (not below it) with the PSD's name, in any case. None when it can't be read. */
export async function imagesNamedFor(psdPath: string): Promise<string[]> {
  const dir = dirname(psdPath)
  const stem = normalizeStem(psdPath)
  const names = await fs.readdir(dir).catch((): string[] => [])
  const named = names.filter((name) => isSidecarImage(name) && normalizeStem(name) === stem)
  const files = await Promise.all(named.map((name) => leadsToFile(join(dir, name))))
  return named.filter((_, i) => files[i]).map((name) => join(dir, name))
}

export function normalizeStem(fileName: string): string {
  const base = basename(fileName, extname(fileName))
  return base.toLowerCase().trim().replace(/\s+/g, ' ')
}

export interface SidecarMatch {
  path: string
  candidateName: string
  confidence: number
}

function bigramDice(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      m.set(bg, (m.get(bg) ?? 0) + 1)
    }
    return m
  }

  const aMap = bigrams(a)
  const bMap = bigrams(b)
  let intersection = 0
  for (const [bg, count] of aMap) {
    intersection += Math.min(count, bMap.get(bg) ?? 0)
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1))
}

function pathDistance(psdPath: string, candidatePath: string): number {
  const psdDir = psdPath.replace(/\/[^/]+$/, '')
  const candidateDir = candidatePath.replace(/\/[^/]+$/, '')
  if (psdDir === candidateDir) return 0
  const psdParts = psdDir.split('/')
  const candParts = candidateDir.split('/')
  let common = 0
  const minLen = Math.min(psdParts.length, candParts.length)
  for (let i = 0; i < minLen; i++) {
    if (psdParts[i] === candParts[i]) common++
    else break
  }
  return psdParts.length - common + (candParts.length - common)
}

/**
 * An image named for the PSD: the nearest one with its exact name anywhere in the drop, else a
 * near-miss name, which is only trusted from the PSD's own folder. Further away, a near miss is
 * as likely to be another kit's render ("iphone-15-pro-max" for "iphone-15-pro").
 */
export function findSidecar(psdPath: string, candidateImagePaths: string[]): SidecarMatch | null {
  const psdStem = normalizeStem(psdPath)
  const psdDir = dirname(psdPath)

  const exactMatches: SidecarMatch[] = []
  const fuzzyMatches: SidecarMatch[] = []

  for (const candidatePath of candidateImagePaths) {
    const candStem = normalizeStem(candidatePath)
    if (candStem === psdStem) {
      exactMatches.push({
        path: candidatePath,
        candidateName: basename(candidatePath),
        confidence: 1.0,
      })
    } else if (dirname(candidatePath) === psdDir) {
      const score = bigramDice(psdStem, candStem)
      if (score >= SIDECAR_FUZZY_THRESHOLD) {
        fuzzyMatches.push({
          path: candidatePath,
          candidateName: basename(candidatePath),
          confidence: score,
        })
      }
    }
  }

  if (exactMatches.length > 0) {
    exactMatches.sort((a, b) => pathDistance(psdPath, a.path) - pathDistance(psdPath, b.path))
    return exactMatches[0] ?? null
  }

  if (fuzzyMatches.length > 0) {
    fuzzyMatches.sort((a, b) => b.confidence - a.confidence)
    return fuzzyMatches[0] ?? null
  }

  return null
}

/**
 * The preview image a mockup kit ships beside a PSD whose composite is a placeholder. Stricter than
 * `findSidecar`, because it replaces a cover the PSD does have: an image with the PSD's own name
 * (the nearest, if several), else the folder's `preview` image, else the only image in the folder.
 * Null when the folder holds several images and none of them is named for the PSD.
 */
export function findPreviewFor(psdPath: string, candidateImagePaths: string[]): SidecarMatch | null {
  const psdStem = normalizeStem(psdPath)
  const match = (path: string, confidence: number): SidecarMatch => ({
    path,
    candidateName: basename(path),
    confidence
  })

  const named = candidateImagePaths
    .filter((p) => normalizeStem(p) === psdStem)
    .sort((a, b) => pathDistance(psdPath, a) - pathDistance(psdPath, b))
  if (named[0]) return match(named[0], 1)

  const beside = candidateImagePaths.filter((p) => dirname(p) === dirname(psdPath))
  const previews = beside.filter((p) => normalizeStem(p) === 'preview')
  if (previews.length === 1) return match(previews[0]!, 1)
  if (beside.length === 1) return match(beside[0]!, 1)
  return null
}
