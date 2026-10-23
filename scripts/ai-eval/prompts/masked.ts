import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

/**
 * The cover with its design slot (`slot-mask.png` from `ai-eval:slots`) painted over, so the model
 * never sees the placeholder. Written once next to the cover (`masked-<style>.png`) and reused. A
 * cover with no fitting mask comes back as it is. Not a version itself.
 *
 * - `grey`: flat mid grey.
 * - `blur`: a heavy blur of the slot itself, colours kept.
 * - `soft`: that blur in grey; the shading stays, the text and colours go.
 * - `outline`: flat mid grey with a thin dark edge, so it reads as a flat area.
 * - `tone`: flat, in the mean colour of the scene just around the slot.
 * - `inpaint`: filled from the pixels around the slot only (push-pull), then smoothed.
 * - `label`: flat light grey with "DESIGN AREA" written in each slot.
 */
export type MaskStyle = 'grey' | 'blur' | 'soft' | 'outline' | 'tone' | 'inpaint' | 'label'

type Raw = { data: Buffer; width: number; height: number }

/** Binary mask, 1 where the slot is. */
function binary(alpha: Buffer): Uint8Array {
  const m = new Uint8Array(alpha.length)
  for (let i = 0; i < alpha.length; i++) m[i] = alpha[i]! >= 128 ? 1 : 0
  return m
}

/** Mask pixels within `d` pixels of a non-mask pixel. */
function edge(m: Uint8Array, w: number, h: number, d: number): Uint8Array {
  const e = new Uint8Array(m.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!m[i]) continue
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !m[ny * w + nx]) {
          e[i] = 1
          break
        }
      }
    }
  return e
}

/** The mean colour of the scene in a ring just outside the slot. */
function ringColour(img: Raw, m: Uint8Array): [number, number, number] {
  const { width: w, height: h, data } = img
  const r = Math.max(4, Math.round(Math.max(w, h) / 200))
  const sum = [0, 0, 0]
  let n = 0
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const i = y * w + x
      if (m[i]) continue
      let near = false
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[ny * w + nx]) near = true
      }
      if (!near) continue
      for (let c = 0; c < 3; c++) sum[c]! += data[i * 3 + c]!
      n++
    }
  return n === 0 ? [128, 128, 128] : [sum[0]! / n, sum[1]! / n, sum[2]! / n]
}

/** Fills the slot from its surroundings only: a push-pull pyramid over the pixels outside it. */
function pushPull(img: Raw, m: Uint8Array): Float32Array {
  const { width: w0, height: h0, data } = img
  const levels: { w: number; h: number; c: Float32Array; k: Float32Array }[] = []
  let c = new Float32Array(w0 * h0 * 3)
  let k = new Float32Array(w0 * h0)
  for (let i = 0; i < w0 * h0; i++) {
    if (m[i]) continue
    k[i] = 1
    for (let ch = 0; ch < 3; ch++) c[i * 3 + ch] = data[i * 3 + ch]!
  }
  let w = w0
  let h = h0
  levels.push({ w, h, c, k })
  while (w > 2 && h > 2) {
    const nw = Math.ceil(w / 2)
    const nh = Math.ceil(h / 2)
    const nc = new Float32Array(nw * nh * 3)
    const nk = new Float32Array(nw * nh)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const j = (y >> 1) * nw + (x >> 1)
        nk[j]! += k[i]!
        for (let ch = 0; ch < 3; ch++) nc[j * 3 + ch]! += c[i * 3 + ch]!
      }
    w = nw
    h = nh
    c = nc
    k = nk
    levels.push({ w, h, c, k })
  }
  // Pull: a level's empty pixels take their parent's value.
  let values = new Float32Array(0)
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li]!
    const parent = levels[li + 1]
    const next = new Float32Array(L.w * L.h * 3)
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x
        for (let ch = 0; ch < 3; ch++)
          next[i * 3 + ch] =
            L.k[i]! > 0
              ? L.c[i * 3 + ch]! / L.k[i]!
              : parent
                ? values[((y >> 1) * parent.w + (x >> 1)) * 3 + ch]!
                : 128
      }
    values = next
  }
  return values
}

/** Where to write "DESIGN AREA": one box per sizeable connected part of the slot. */
function labelBoxes(m: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  const s = Math.max(1, Math.round(Math.max(w, h) / 256))
  const sw = Math.ceil(w / s)
  const sh = Math.ceil(h / s)
  const small = new Uint8Array(sw * sh)
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (m[Math.min(h - 1, y * s) * w + Math.min(w - 1, x * s)]) small[y * sw + x] = 1
  const seen = new Uint8Array(sw * sh)
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  for (let start = 0; start < small.length; start++) {
    if (!small[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let x0 = sw
    let y0 = sh
    let x1 = 0
    let y1 = 0
    let n = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % sw
      const y = (i - x) / sw
      n++
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
      const near = [x > 0 ? i - 1 : -1, x < sw - 1 ? i + 1 : -1, i - sw, i + sw]
      for (const j of near)
        if (j >= 0 && j < small.length && small[j] && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
    }
    if (n < small.length * 0.004) continue
    boxes.push({ x: x0 * s, y: y0 * s, w: (x1 - x0 + 1) * s, h: (y1 - y0 + 1) * s })
  }
  return boxes
}

export async function maskedCoverPath(coverPath: string, style: MaskStyle = 'grey'): Promise<string> {
  const dir = dirname(coverPath)
  const maskPath = join(dir, 'slot-mask.png')
  if (!existsSync(maskPath)) return coverPath
  const out = join(dir, `masked-${style}.png`)
  if (existsSync(out)) return out
  const cover = await sharp(coverPath).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = cover.info
  const img: Raw = { data: cover.data, width, height }
  // The mask, softened by a pixel so the fill has no jagged edge.
  const alpha = await sharp(maskPath).greyscale().blur(1).toColourspace('b-w').raw().toBuffer()
  const m = binary(alpha)

  let fill: (i: number, c: number) => number
  if (style === 'blur' || style === 'soft') {
    const blurred = await sharp(cover.data, { raw: { width, height, channels: 3 } })
      .blur(Math.max(width, height) / 40)
      .modulate({ saturation: style === 'soft' ? 0 : 1 })
      .raw()
      .toBuffer()
    fill = (i, c) => blurred[i * 3 + c]!
  } else if (style === 'outline') {
    const e = edge(m, width, height, Math.max(2, Math.round(Math.max(width, height) / 600)))
    fill = (i) => (e[i] ? 64 : 128)
  } else if (style === 'tone') {
    const ring = ringColour(img, m)
    fill = (_i, c) => ring[c]!
  } else if (style === 'inpaint') {
    const filled = pushPull(img, m)
    const buf = Buffer.alloc(width * height * 3)
    for (let i = 0; i < buf.length; i++) buf[i] = Math.round(filled[i]!)
    const smooth = await sharp(buf, { raw: { width, height, channels: 3 } })
      .blur(Math.max(width, height) / 120)
      .raw()
      .toBuffer()
    fill = (i, c) => smooth[i * 3 + c]!
  } else if (style === 'label') {
    fill = () => 214
  } else {
    fill = () => 128
  }

  const pixels = Buffer.from(cover.data)
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i]! / 255
    if (a === 0) continue
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c
      pixels[j] = Math.round(pixels[j]! * (1 - a) + fill(i, c) * a)
    }
  }
  let result = sharp(pixels, { raw: { width, height, channels: 3 } })
  if (style === 'label') {
    const texts = labelBoxes(m, width, height).map((b) => {
      const size = Math.max(12, Math.round(Math.min(b.w / 7, b.h / 4)))
      return `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="600" fill="#8c8c8c" text-anchor="middle" dominant-baseline="middle">DESIGN AREA</text>`
    })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${texts.join('')}</svg>`
    result = sharp(await result.png().toBuffer()).composite([{ input: Buffer.from(svg) }])
  }
  await result.png().toFile(out)
  return out
}
