import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

/**
 * The cover with its design slot (`slot-mask.png` from `ai-eval:slots`) painted over, so the model
 * never sees the placeholder: `grey` fills it with flat mid grey, `blur` with a heavy blur of
 * itself, `soft` with that blur in grey (the shading stays, the text and colours go). Written once next to the cover and reused. A cover with no fitting mask comes back as it
 * is. Not a version itself.
 */
export type MaskStyle = 'grey' | 'blur' | 'soft'

export async function maskedCoverPath(coverPath: string, style: MaskStyle = 'grey'): Promise<string> {
  const dir = dirname(coverPath)
  const maskPath = join(dir, 'slot-mask.png')
  if (!existsSync(maskPath)) return coverPath
  const out = join(dir, `masked-${style}.png`)
  if (existsSync(out)) return out
  const cover = await sharp(coverPath).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = cover.info
  const fill =
    style === 'grey'
      ? null
      : await sharp(cover.data, { raw: { width, height, channels: 3 } })
          .blur(Math.max(width, height) / 40)
          .modulate({ saturation: style === 'soft' ? 0 : 1 })
          .raw()
          .toBuffer()
  // The mask, softened by a pixel so the fill has no jagged edge.
  const alpha = await sharp(maskPath).greyscale().blur(1).toColourspace('b-w').raw().toBuffer()
  const pixels = Buffer.from(cover.data)
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i]! / 255
    if (a === 0) continue
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c
      pixels[j] = Math.round(pixels[j]! * (1 - a) + (fill ? fill[j]! : 128) * a)
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(out)
  return out
}
