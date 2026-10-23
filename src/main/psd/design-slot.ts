import { readFile } from 'node:fs/promises'
import { readPsd, type Layer, type Psd } from 'ag-psd'
import sharp from 'sharp'
// The canvas shim ag-psd needs is set up there.
import './embedded'

/**
 * A mockup's design slot: the smart objects a designer puts their own work into ("Change This",
 * "Place Your Design Here", "Screen 1"). What a slot shows in the cover is a stand-in (a grid, sample
 * art, "your design here"), so the AI is shown the cover with the slot painted over and never
 * describes it (design/research/ai-round3.md). The cover people see is never changed.
 *
 * Measured on the 90 test-set mockups: names find a slot in all 90, and the mask fits the cover in
 * 85 (the rest have a sidecar cover framed differently from the document).
 */

/** The slot mask's file name, beside the cover in a mockup's folder. */
export const SLOT_MASK_FILE = 'slot-mask.png'

/** Names a designer's own content goes into. */
const DESIGN =
  /change this|your design|design here|put your|place your|edit (?:content|me)|insert|replace|double.?click|smart.?object|\bscreens?\b|\bdisplay\b|\bcover\b|\blabel\b|\bdesign\b|\bartwork\b|\blogo\b|\bprint\b|\bposter\b|\bimage\b|\bpicture\b|\bphoto\b|\byour\b|\bhere\b|\bpage\b|\bwallpaper\b/i
/** Scene parts and overlays, never the design. */
const SCENE =
  /\b(?:base|object|shadows?|background|bg|reflex|reflections?|highlights?|lights?|glare|colou?rs?|fx|overlays?|remove|delete|mask|body|frame|device)\b/i
/** Overlay notices ("Remove this layer") and effect groups never hide a slot. */
const NOTICE = /\b(?:fx|overlays?|remove|delete)\b/i

interface Flat {
  layer: Layer
  path: string[]
  /** Paint order, bottom first. */
  order: number
  clipBase: Layer | null
  /** A normal, opaque layer whose groups blend normally too: what it covers is hidden. */
  plain: boolean
}

function flatten(psd: Psd): Flat[] {
  const out: Flat[] = []
  const opaque = (l: Layer) => (l.opacity ?? 1) >= 0.9 && (l.fillOpacity ?? 1) >= 0.9
  const walk = (layers: Layer[] | undefined, path: string[], plainGroups: boolean) => {
    let base: Layer | null = null
    for (const layer of layers ?? []) {
      if (!layer.clipping) base = layer
      if (layer.hidden) continue
      if (layer.children) {
        const blendsNormally = ['pass through', 'normal'].includes(layer.blendMode ?? 'pass through')
        walk(layer.children, [...path, layer.name ?? ''], plainGroups && opaque(layer) && blendsNormally)
        continue
      }
      out.push({
        layer,
        path,
        order: out.length,
        clipBase: layer.clipping ? base : null,
        plain: plainGroups && opaque(layer) && (layer.blendMode ?? 'normal') === 'normal'
      })
    }
  }
  walk(psd.children, [], true)
  return out
}

function slotsIn(flat: Flat[]): Flat[] {
  const smart = flat.filter((f) => f.layer.placedLayer && !SCENE.test(f.layer.name ?? ''))
  const named = smart.filter(
    (f) => DESIGN.test(f.layer.name ?? '') || f.path.some((p) => DESIGN.test(p) && !SCENE.test(p))
  )
  // Mockups Design names the smart object after the product ("Leggings").
  return named.length > 0 ? named : smart
}

/** A layer's alpha (0 to 1) at a document pixel, times its layer mask. */
function alphaAt(layer: Layer, x: number, y: number): number {
  const img = layer.imageData
  const left = layer.left ?? 0
  const top = layer.top ?? 0
  if (!img || x < left || y < top || x >= left + img.width || y >= top + img.height) return 0
  let a = img.data[((y - top) * img.width + (x - left)) * 4 + 3]! / 255
  const mask = layer.mask
  if (a > 0 && mask && !mask.disabled) {
    const m = mask.imageData
    const ml = mask.left ?? 0
    const mt = mask.top ?? 0
    let v = (mask.defaultColor ?? 0) / 255
    if (m && x >= ml && y >= mt && x < ml + m.width && y < mt + m.height) v = m.data[((y - mt) * m.width + (x - ml)) * 4]! / 255
    a *= v
  }
  return a
}

const clippedAlphaAt = (f: Flat, x: number, y: number) => {
  const a = alphaAt(f.layer, x, y)
  return a > 0 && f.clipBase ? a * alphaAt(f.clipBase, x, y) : a
}

type Box = [number, number, number, number]
const boxOf = (l: Layer): Box => [l.left ?? 0, l.top ?? 0, l.right ?? 0, l.bottom ?? 0]
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

/**
 * The document-sized slot mask (one byte a pixel, 255 where the placeholder shows) and the slot
 * names. A slot's pixels are those Photoshop saved for the layer (at least half opaque), times its
 * layer mask and clipping base, less what a plain opaque layer painted above it hides (a hand over a
 * screen, a higher colourway's background). The document must be read with its layer pixels.
 */
export function designSlotMask(psd: Psd): { mask: Uint8Array; slots: string[] } {
  const { width: w, height: h } = psd
  const flat = flatten(psd)
  const slots = slotsIn(flat)
  const mask = new Uint8Array(w * h)
  const occluders = flat.filter(
    (f) => f.plain && !slots.includes(f) && !NOTICE.test([...f.path, f.layer.name ?? ''].join(' '))
  )
  for (const s of slots) {
    const box = boxOf(s.layer)
    const above = occluders.filter((c) => c.order > s.order && overlaps(boxOf(c.layer), box))
    for (let y = Math.max(0, box[1]); y < Math.min(h, box[3]); y++)
      for (let x = Math.max(0, box[0]); x < Math.min(w, box[2]); x++) {
        if (clippedAlphaAt(s, x, y) < 0.5) continue
        if (!above.some((c) => clippedAlphaAt(c, x, y) >= 0.9)) mask[y * w + x] = 255
      }
  }
  return { mask, slots: slots.map((s) => s.layer.name ?? '') }
}

async function readWithLayers(psdPath: string): Promise<Psd> {
  const bytes = await readFile(psdPath)
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return readPsd(ab, { skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true, useImageData: true })
}

/**
 * Writes the slot mask beside the cover, at the cover's size (white where the placeholder shows),
 * and says whether it did. Nothing is written when the PSD can't be read, has no slot, or the cover
 * isn't the document's shape (a sidecar framed differently), so the AI sees the cover as it is.
 */
export async function writeDesignSlotMask(
  psdPath: string,
  coverPath: string,
  outPath: string,
  deps: { read?: (psdPath: string) => Promise<Psd> } = {}
): Promise<boolean> {
  try {
    const psd = await (deps.read ?? readWithLayers)(psdPath)
    const { mask } = designSlotMask(psd)
    if (!mask.some((v) => v)) return false
    const { width, height } = await sharp(coverPath).metadata()
    if (!width || !height) return false
    const docAspect = psd.width / psd.height
    if (Math.abs(width / height - docAspect) / docAspect >= 0.015) return false
    await sharp(Buffer.from(mask), { raw: { width: psd.width, height: psd.height, channels: 1 } })
      .resize(width, height, { fit: 'fill' })
      .threshold(128)
      .png()
      .toFile(outPath)
    return true
  } catch {
    return false
  }
}
