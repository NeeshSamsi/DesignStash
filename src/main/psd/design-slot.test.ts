import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Layer, Psd } from 'ag-psd'
import { designSlotMask, writeDesignSlotMask } from './design-slot'

const W = 20
const H = 10

/** A layer covering a rectangle, every pixel at `alpha`. */
function layer(name: string, rect: [number, number, number, number], extra: Partial<Layer> = {}, alpha = 255): Layer {
  const [left, top, right, bottom] = rect
  const w = right - left
  const h = bottom - top
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = alpha
  return { name, left, top, right, bottom, blendMode: 'normal', opacity: 1, imageData: { width: w, height: h, data } as ImageData, ...extra }
}

const so = (name: string, rect: [number, number, number, number], extra: Partial<Layer> = {}) =>
  layer(name, rect, { placedLayer: { id: name, type: 'raster', transform: [] } as unknown as NonNullable<Layer['placedLayer']>, ...extra })

/** Children bottom first, as ag-psd reads them. */
const psd = (children: Layer[]): Psd => ({ width: W, height: H, children })

const count = (mask: Uint8Array) => mask.reduce((t, v) => t + (v ? 1 : 0), 0)
const at = (mask: Uint8Array, x: number, y: number) => mask[y * W + x]

describe('designSlotMask', () => {
  it('marks the pixels of a smart object named like a design layer', () => {
    const r = designSlotMask(psd([layer('Background', [0, 0, W, H]), so('Change This', [2, 2, 6, 5])]))
    expect(r.slots).toEqual(['Change This'])
    expect(count(r.mask)).toBe(4 * 3)
    expect(at(r.mask, 2, 2)).toBe(255)
    expect(at(r.mask, 6, 2)).toBe(0)
  })

  it('takes a smart object inside a group named like a design layer', () => {
    const group: Layer = { name: 'Place Your Design Here', children: [so('Screen 1', [0, 0, 4, 4])], blendMode: 'pass through', opacity: 1 }
    expect(designSlotMask(psd([group])).slots).toEqual(['Screen 1'])
  })

  it('never takes a scene part, a hidden layer or a layer in a hidden group', () => {
    const hiddenGroup: Layer = { name: 'Design', hidden: true, children: [so('Change This', [0, 0, 4, 4])], blendMode: 'pass through' }
    const r = designSlotMask(
      psd([so('Object', [0, 0, W, H]), so('Shadow', [0, 0, 4, 4]), so('Change This', [5, 5, 8, 8], { hidden: true }), hiddenGroup, so('Screen', [10, 0, 12, 2])])
    )
    expect(r.slots).toEqual(['Screen'])
    expect(count(r.mask)).toBe(4)
  })

  it('falls back to any smart object that is not a scene part when none is named like a design layer', () => {
    const r = designSlotMask(psd([so('Background', [0, 0, W, H]), so('Leggings', [1, 1, 3, 3])]))
    expect(r.slots).toEqual(['Leggings'])
  })

  it('finds no slot in a document without smart objects', () => {
    const r = designSlotMask(psd([layer('Change This', [0, 0, 4, 4])]))
    expect(r.slots).toEqual([])
    expect(count(r.mask)).toBe(0)
  })

  it('leaves out what an opaque plain layer above hides, but not what a blend-mode group paints over', () => {
    const hand = layer('Hand', [0, 0, 3, H])
    const highlights: Layer = { name: 'Highlights', blendMode: 'screen', opacity: 1, children: [layer('Glare', [0, 0, W, H])] }
    const r = designSlotMask(psd([so('Change This', [0, 0, 6, 4]), hand, highlights]))
    expect(at(r.mask, 1, 1)).toBe(0)
    expect(at(r.mask, 4, 1)).toBe(255)
    expect(count(r.mask)).toBe(3 * 4)
  })

  it('does not let a layer under the slot hide it', () => {
    const r = designSlotMask(psd([layer('Body', [0, 0, W, H]), so('Change This', [0, 0, 4, 4])]))
    expect(count(r.mask)).toBe(16)
  })

  it('applies the layer mask and the clipping base', () => {
    const maskData = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) maskData[i * 4] = i % 4 < 2 ? 255 : 0
    const masked = so('Change This', [0, 0, 4, 4], { mask: { left: 0, top: 0, right: 4, bottom: 4, defaultColor: 0, imageData: { width: 4, height: 4, data: maskData } as ImageData } })
    expect(count(designSlotMask(psd([masked])).mask)).toBe(8)

    const base = layer('Screen shape', [0, 0, 2, 2])
    const clipped = so('Change This', [0, 0, 4, 4], { clipping: true })
    expect(count(designSlotMask(psd([base, clipped])).mask)).toBe(4)
  })

  it('ignores pixels under half opacity', () => {
    const faint = layer('Change This', [0, 0, 4, 4], { placedLayer: { id: 'x' } as unknown as NonNullable<Layer['placedLayer']> }, 60)
    expect(count(designSlotMask(psd([faint])).mask)).toBe(0)
  })
})

describe('writeDesignSlotMask', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const tempDir = () => {
    const d = mkdtempSync(join(tmpdir(), 'ds-slot-'))
    dirs.push(d)
    return d
  }
  const cover = async (dir: string, w: number, h: number) => {
    const p = join(dir, 'cover.webp')
    await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } }).webp().toFile(p)
    return p
  }
  const doc = psd([so('Change This', [0, 0, 10, 10])])

  it('writes a cover-sized mask when the cover has the document shape', async () => {
    const dir = tempDir()
    const out = join(dir, 'slot-mask.png')
    const wrote = await writeDesignSlotMask('x.psd', await cover(dir, 40, 20), out, { read: async () => doc })
    expect(wrote).toBe(true)
    const meta = await sharp(out).metadata()
    expect([meta.width, meta.height]).toEqual([40, 20])
    const { channels } = await sharp(out).stats()
    expect(channels[0]!.mean / 255).toBeCloseTo(0.5, 1)
  })

  it('writes nothing when the cover has another shape, there is no slot, or the PSD cannot be read', async () => {
    const dir = tempDir()
    const out = join(dir, 'slot-mask.png')
    expect(await writeDesignSlotMask('x.psd', await cover(dir, 30, 30), out, { read: async () => doc })).toBe(false)
    expect(await writeDesignSlotMask('x.psd', await cover(dir, 40, 20), out, { read: async () => psd([]) })).toBe(false)
    expect(
      await writeDesignSlotMask('x.psd', await cover(dir, 40, 20), out, {
        read: async () => {
          throw new Error('bad psd')
        }
      })
    ).toBe(false)
    expect(existsSync(out)).toBe(false)
  })
})
