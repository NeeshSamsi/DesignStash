import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { SLOT_MASK_FILE } from '../psd/design-slot'

/**
 * The cover the AI is shown: the mockup's cover with its design slot (`slot-mask.png`, made at
 * import by `writeDesignSlotMask`) painted over, so the model never describes the placeholder that
 * the designer's own work replaces. Tuned per model in the eval (design/research/ai-round3.md):
 *
 * - `label`: flat light grey with "DESIGN AREA" written in each part of the slot. With the profile's
 *   mask rule, the models read it as the area the design goes, and least often as an object or a colour.
 * - `outline`: flat mid grey with a thin dark edge. It reads as a flat area, never as an object.
 * - `soft`: a heavy blur of the slot in grey. The shading stays; the text, art and colours go.
 *
 * Written once beside the cover (`cover-ai-<fill>.png`) and reused. The cover people see is never
 * changed. Null when there is no mask or it can't be used, so the model sees the cover as it is.
 */
export type MaskFill = 'label' | 'outline' | 'soft'

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

/** Where to write "DESIGN AREA": one box per part of the slot bigger than 0.4% of the cover. */
function labelBoxes(mask: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  // Found on a grid of about 256 cells along the long edge, which is plenty to place a label.
  const s = Math.max(1, Math.round(Math.max(w, h) / 256))
  const sw = Math.ceil(w / s)
  const sh = Math.ceil(h / s)
  const cells = new Uint8Array(sw * sh)
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (mask[Math.min(h - 1, y * s) * w + Math.min(w - 1, x * s)]) cells[y * sw + x] = 1
  const seen = new Uint8Array(sw * sh)
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  for (let start = 0; start < cells.length; start++) {
    if (!cells[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let [x0, y0, x1, y1, n] = [sw, sh, 0, 0, 0]
    while (stack.length > 0) {
      const i = stack.pop()!
      const x = i % sw
      const y = (i - x) / sw
      n++
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
      for (const j of [x > 0 ? i - 1 : -1, x < sw - 1 ? i + 1 : -1, i - sw, i + sw])
        if (j >= 0 && j < cells.length && cells[j] && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
    }
    if (n >= cells.length * 0.004) boxes.push({ x: x0 * s, y: y0 * s, w: (x1 - x0 + 1) * s, h: (y1 - y0 + 1) * s })
  }
  return boxes
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
    const inside = new Uint8Array(width * height)
    for (let i = 0; i < inside.length; i++) inside[i] = alpha[i]! >= 128 ? 1 : 0
    let paint: (i: number, c: number) => number
    if (fill === 'label') {
      paint = () => 214
    } else if (fill === 'soft') {
      const blurred = await sharp(cover.data, { raw: { width, height, channels: 3 } })
        .blur(Math.max(width, height) / 40)
        .modulate({ saturation: 0 })
        .raw()
        .toBuffer()
      paint = (i, c) => blurred[i * 3 + c]!
    } else {
      const edge = edgeOf(inside, width, height, Math.max(2, Math.round(Math.max(width, height) / 600)))
      paint = (i) => (edge[i] ? 64 : 128)
    }
    const pixels = Buffer.from(cover.data)
    for (let i = 0; i < width * height; i++) {
      const a = alpha[i]! / 255
      if (a === 0) continue
      for (let c = 0; c < 3; c++) pixels[i * 3 + c] = Math.round(pixels[i * 3 + c]! * (1 - a) + paint(i, c) * a)
    }
    let image = sharp(pixels, { raw: { width, height, channels: 3 } })
    if (fill === 'label') {
      const texts = labelBoxes(inside, width, height).map((b) => {
        const size = Math.max(12, Math.round(Math.min(b.w / 7, b.h / 4)))
        return `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="600" fill="#8c8c8c" text-anchor="middle" dominant-baseline="middle">DESIGN AREA</text>`
      })
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${texts.join('')}</svg>`
      image = sharp(await image.png().toBuffer()).composite([{ input: Buffer.from(svg) }])
    }
    await image.png().toFile(out)
    return out
  } catch {
    return null
  }
}
