import { readEmbeddedPreview } from './embedded'
import { generateCoverFromRaw, generateCoverFromFile } from './image'
import { isPlaceholder } from './placeholder'
import { findPreviewFor, findSidecar } from './sidecar'
import type { ResolveCoverInput, CoverResolution } from './types'

/**
 * A mockup's cover: the PSD's composite, or an image shipped beside it when the PSD has no usable
 * composite or its composite is a placeholder ("DELETE THIS LAYER"). A placeholder stays the cover
 * when no preview image can be picked out or read.
 */
export async function resolveCover(input: ResolveCoverInput): Promise<CoverResolution> {
  const { psdPath, sidecarFor = psdPath, candidateImagePaths, readImage, outDir } = input
  const open = (path: string) => (readImage ? readImage(path) : path)

  const raw = await readEmbeddedPreview(psdPath)
  if (raw) {
    const preview = (await isPlaceholder(raw)) ? findPreviewFor(sidecarFor, candidateImagePaths) : null
    if (preview) {
      try {
        const { coverPath, thumbPath } = await generateCoverFromFile(await open(preview.path), outDir)
        return {
          source: 'sidecar',
          coverPath,
          thumbPath,
          candidateName: preview.candidateName,
          confidence: preview.confidence,
        }
      } catch {
        // An image that won't decode: the placeholder is still a cover.
      }
    }
    const { coverPath, thumbPath } = await generateCoverFromRaw(raw, outDir)
    return { source: 'embedded', coverPath, thumbPath }
  }

  const match = findSidecar(sidecarFor, candidateImagePaths)
  if (match) {
    const { coverPath, thumbPath } = await generateCoverFromFile(await open(match.path), outDir)
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
