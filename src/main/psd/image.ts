import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { COVER_MAX_EDGE, THUMB_MAX_EDGE, THUMB_WEBP_QUALITY } from '@shared/constants'
import type { RawImage } from './types'

export async function generateCoverFromRaw(
  raw: RawImage,
  outDir: string
): Promise<{ coverPath: string; thumbPath: string }> {
  await mkdir(outDir, { recursive: true })
  const coverPath = join(outDir, 'cover.png')
  const thumbPath = join(outDir, 'thumb.webp')

  const base = sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: 4 },
  })

  await base
    .clone()
    .resize(COVER_MAX_EDGE, COVER_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toFile(coverPath)

  await base
    .clone()
    .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toFile(thumbPath)

  return { coverPath, thumbPath }
}

export async function generateCoverFromFile(
  imagePath: string,
  outDir: string
): Promise<{ coverPath: string; thumbPath: string }> {
  await mkdir(outDir, { recursive: true })
  const coverPath = join(outDir, 'cover.png')
  const thumbPath = join(outDir, 'thumb.webp')

  const base = sharp(imagePath)

  await base
    .clone()
    .resize(COVER_MAX_EDGE, COVER_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toFile(coverPath)

  await base
    .clone()
    .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toFile(thumbPath)

  return { coverPath, thumbPath }
}
