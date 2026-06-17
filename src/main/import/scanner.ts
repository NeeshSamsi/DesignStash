import { readdirSync, statSync } from 'node:fs'
import { extname, join, basename, sep, relative } from 'node:path'
import { collectCandidateImages } from '../psd'

export interface ScannedPsd {
  psdPath: string
  importContext: { originalFileName: string; folderTrail: string[] }
}
export interface ScanResult {
  psds: ScannedPsd[]
  skippedCount: number // non-.psd files encountered
  candidateImagePaths: string[] // ALL sidecar-eligible images across the dropped tree (for M2 resolveCover)
}

export function scanForPsds(droppedPaths: string[]): ScanResult {
  const result: ScanResult = {
    psds: [],
    skippedCount: 0,
    candidateImagePaths: []
  }

  const उम्मीदवारImages = new Set<string>()

  function recurse(path: string, root: string) {
    const stat = statSync(path)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(path, entry.name)
        recurse(fullPath, root)
      }
    } else if (stat.isFile()) {
      if (extname(path).toLowerCase() === '.psd') {
        const folderTrail = relative(root, path)
          .split(sep)
          .slice(0, -1)
          // a directly-dropped single file will have '..' as the first part, filter that out
          .filter((p) => p !== '..')

        result.psds.push({
          psdPath: path,
          importContext: {
            originalFileName: basename(path),
            folderTrail
          }
        })
      } else {
        result.skippedCount++
      }
    }
  }

  for (const path of droppedPaths) {
    const stat = statSync(path)
    const root = stat.isDirectory() ? path : join(path, '..')
    for (const imagePath of collectCandidateImages(root)) {
      उम्मीदवारImages.add(imagePath)
    }
    recurse(path, root)
  }

  result.candidateImagePaths = [...उम्मीदवारImages]
  return result
}
