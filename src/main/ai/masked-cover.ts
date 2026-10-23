import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { SLOT_MASK_FILE } from '../psd/design-slot'

/**
 * The cover the AI is shown: the mockup's cover with its design slot (`slot-mask.png`, made at
 * import by `writeDesignSlotMask`) painted over, so the model never describes the placeholder that
 * the designer's own work replaces. Tuned per model in the eval (design/research/ai-round3.md):
 *
 * - `outline`: flat mid grey with a thin dark edge. It reads as a flat area, never as an object.
 * - `soft`: a heavy blur of the slot in grey. The shading stays; the text, art and colours go.
 *
 * Written once beside the cover (`cover-ai-<fill>.png`) and reused. The cover people see is never
 * changed. Null when there is no mask or it can't be used, so the model sees the cover as it is.
 */
export type MaskFill = 'outline' | 'soft'

/** Mask pixels within `d` pixels of the slot's edge. */
function edgeOf(mask: Uint8Array, w: number, h: number, d: number): Uint8Array {
  const edge = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      const outside = (nx: number, ny: number) => nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]
      if (outside(x + d, y) || outside(x - d, y) || outside(x, y + d) || outside(x, y - d)) edge[i] = 1
    }
  return edge
}

export async function maskedCoverPath(coverPath: string, fill: MaskFill): Promise<string | null> {
  const dir = dirname(coverPath)
  const maskPath = join(dir, SLOT_MASK_FILE)
  if (!existsSync(maskPath)) return null
  const out = join(dir, `cover-ai-${fill}.png`)
  if (existsSync(out)) return out
  try {
    const cover = await sharp(coverPath).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const { width, height } = cover.info
    // Softened by a pixel, so the fill has no jagged edge.
    const alpha = await sharp(maskPath).resize(width, height, { fit: 'fill' }).greyscale().blur(1).toColourspace('b-w').raw().toBuffer()
    let paint: (i: number, c: number) => number
    if (fill === 'soft') {
      const blurred = await sharp(cover.data, { raw: { width, height, channels: 3 } })
        .blur(Math.max(width, height) / 40)
        .modulate({ saturation: 0 })
        .raw()
        .toBuffer()
      paint = (i, c) => blurred[i * 3 + c]!
    } else {
      const inside = new Uint8Array(width * height)
      for (let i = 0; i < inside.length; i++) inside[i] = alpha[i]! >= 128 ? 1 : 0
      const edge = edgeOf(inside, width, height, Math.max(2, Math.round(Math.max(width, height) / 600)))
      paint = (i) => (edge[i] ? 64 : 128)
    }
    const pixels = Buffer.from(cover.data)
    for (let i = 0; i < width * height; i++) {
      const a = alpha[i]! / 255
      if (a === 0) continue
      for (let c = 0; c < 3; c++) pixels[i * 3 + c] = Math.round(pixels[i * 3 + c]! * (1 - a) + paint(i, c) * a)
    }
    await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(out)
    return out
  } catch {
    return null
  }
}
