import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  COVER_MAX_EDGE,
  COVER_WEBP_QUALITY,
  THUMB_MAX_EDGE,
  THUMB_WEBP_QUALITY,
  WEBP_EFFORT
} from '@shared/constants'
import type { RawImage } from './types'

/** cover.webp (large zoom preview) + thumb.webp (grid tile). Both optimized WebP. */
async function writeDerivatives(
  base: sharp.Sharp,
  outDir: string
): Promise<{ coverPath: string; thumbPath: string }> {
  await mkdir(outDir, { recursive: true })
  const coverPath = join(outDir, 'cover.webp')
  const thumbPath = join(outDir, 'thumb.webp')

  await base
    .clone()
    .resize(COVER_MAX_EDGE, COVER_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: COVER_WEBP_QUALITY, effort: WEBP_EFFORT })
    .toFile(coverPath)

  await base
    .clone()
    .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY, effort: WEBP_EFFORT })
    .toFile(thumbPath)

  return { coverPath, thumbPath }
}

export function generateCoverFromRaw(
  raw: RawImage,
  outDir: string
): Promise<{ coverPath: string; thumbPath: string }> {
  return writeDerivatives(
    sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }),
    outDir
  )
}

export function generateCoverFromFile(
  imagePath: string,
  outDir: string
): Promise<{ coverPath: string; thumbPath: string }> {
  return writeDerivatives(sharp(imagePath), outDir)
}
