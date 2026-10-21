import { readEmbeddedPreview } from './embedded'
import { generateCoverFromRaw, generateCoverFromFile } from './image'
import { findSidecar } from './sidecar'
import type { ResolveCoverInput, CoverResolution } from './types'

export async function resolveCover(input: ResolveCoverInput): Promise<CoverResolution> {
  const { psdPath, sidecarFor = psdPath, candidateImagePaths, outDir } = input

  const raw = await readEmbeddedPreview(psdPath)
  if (raw) {
    const { coverPath, thumbPath } = await generateCoverFromRaw(raw, outDir)
    return { source: 'embedded', coverPath, thumbPath }
  }

  const match = findSidecar(sidecarFor, candidateImagePaths)
  if (match) {
    const { coverPath, thumbPath } = await generateCoverFromFile(match.path, outDir)
    return {
      source: 'sidecar',
      coverPath,
      thumbPath,
      candidateName: match.candidateName,
      confidence: match.confidence,
    }
  }

  return { source: 'none' }
}
