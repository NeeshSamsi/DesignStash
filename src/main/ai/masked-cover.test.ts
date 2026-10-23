import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { maskedCoverPath } from './masked-cover'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A 40x20 red cover whose left half is the slot, with a mask beside it unless `noMask`. */
async function mockupDir(noMask = false): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'ds-mask-'))
  dirs.push(dir)
  await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff0000' } }).webp({ lossless: true }).toFile(join(dir, 'cover.webp'))
  if (!noMask) {
    const mask = Buffer.alloc(40 * 20)
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) mask[y * 40 + x] = 255
    await sharp(mask, { raw: { width: 40, height: 20, channels: 1 } }).png().toFile(join(dir, 'slot-mask.png'))
  }
  return dir
}

async function pixel(path: string, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * 3
  return [data[i]!, data[i + 1]!, data[i + 2]!]
}

describe('maskedCoverPath', () => {
  it('is null when the cover has no slot mask beside it', async () => {
    const dir = await mockupDir(true)
    expect(await maskedCoverPath(join(dir, 'cover.webp'), 'outline')).toBeNull()
  })

  it('paints the slot flat grey with a dark edge for outline, and leaves the rest of the cover', async () => {
    const dir = await mockupDir()
    const out = (await maskedCoverPath(join(dir, 'cover.webp'), 'outline'))!
    expect(out).toBe(join(dir, 'cover-ai-outline.png'))
    expect(await pixel(out, 10, 10)).toEqual([128, 128, 128])
    expect((await pixel(out, 18, 10))[0]).toBeLessThan(100)
    expect(await pixel(out, 30, 10)).toEqual([255, 0, 0])
  })

  it('fills the slot with a grey blur of itself for soft', async () => {
    const dir = await mockupDir()
    const [r, g, b] = await pixel((await maskedCoverPath(join(dir, 'cover.webp'), 'soft'))!, 5, 10)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('paints the slot light grey and writes DESIGN AREA in it for label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-mask-'))
    dirs.push(dir)
    // A larger cover, so the label has room: 400x200, the left half the slot.
    await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ff0000' } }).webp({ lossless: true }).toFile(join(dir, 'cover.webp'))
    const mask = Buffer.alloc(400 * 200)
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) mask[y * 400 + x] = 255
    await sharp(mask, { raw: { width: 400, height: 200, channels: 1 } }).png().toFile(join(dir, 'slot-mask.png'))
    const out = (await maskedCoverPath(join(dir, 'cover.webp'), 'label'))!
    expect(await pixel(out, 10, 10)).toEqual([214, 214, 214])
    expect(await pixel(out, 300, 100)).toEqual([255, 0, 0])
    // The label's darker type sits in the middle of the slot.
    const { data, info } = await sharp(out).extract({ left: 40, top: 80, width: 120, height: 40 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let dark = 0
    for (let i = 0; i < info.width * info.height; i++) if (data[i * 3]! < 180) dark++
    expect(dark).toBeGreaterThan(50)
  })

  it('writes the masked cover once and reuses it', async () => {
    const dir = await mockupDir()
    const first = (await maskedCoverPath(join(dir, 'cover.webp'), 'outline'))!
    const written = statSync(first).mtimeMs
    expect(await maskedCoverPath(join(dir, 'cover.webp'), 'outline')).toBe(first)
    expect(statSync(first).mtimeMs).toBe(written)
    expect(existsSync(join(dir, 'cover.webp'))).toBe(true)
  })

  it('is null when the mask cannot be read', async () => {
    const dir = await mockupDir(true)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(dir, 'slot-mask.png'), 'not a png')
    expect(await maskedCoverPath(join(dir, 'cover.webp'), 'outline')).toBeNull()
  })
})
