import sharp from 'sharp'
import type { RawImage } from './types'

/**
 * Below this greyscale entropy a cover is a blank page or a notice, never a product shot. Measured on
 * the test set: the three "Remove this layer to start" previews score about 0.23, the plainest real
 * cover 2.24 (design/specs/ai.md).
 */
export const PLACEHOLDER_ENTROPY = 1

/**
 * Whether an image is a placeholder ("DELETE THIS LAYER", "Remove this layer to start") or a blank
 * page: a stored cover's bytes or path, or a PSD's composite. Its greyscale entropy is measured at
 * 256px, so the cost is the same for any size.
 */
export async function isPlaceholder(image: Buffer | string | RawImage): Promise<boolean> {
  const input =
    typeof image === 'string' || Buffer.isBuffer(image)
      ? sharp(image)
      : sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
  const { entropy } = await input.greyscale().resize(256, 256, { fit: 'inside' }).stats()
  return entropy < PLACEHOLDER_ENTROPY
}
