/**
 * ai-eval:slots. Finds where each mockup's replaceable design sits (its "design slot": the smart
 * objects a designer puts their own work into) and writes, per item:
 *
 *   covers/<id>/slots.json        the slot layers, their share of the cover, and whether the mask fits the cover
 *   covers/<id>/slot-mask.png     cover-sized, white where the placeholder shows
 *   covers/<id>/placeholder.jpg   the cover with everything but the placeholder dimmed, for people to look at
 *
 *   pnpm ai-eval:slots [--only a,b]
 *
 * A slot is a visible smart object named like a design layer ("Change This", "Place Your Design
 * Here", "Screen 1", "Edit Content"; the conventions in design/research/mockup-editor-feasibility.md,
 * section 3) and never a scene part (Base, Object, Shadow, Background). Its mask is the pixels
 * Photoshop saved for that layer, times its layer mask and its clipping base, less the opaque
 * normal layers above it (a hand over a screen). The mask is in document pixels: it fits an
 * embedded cover exactly, and a sidecar cover only when the shapes match (same aspect within 1.5%).
 * The test set is only read.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { initializeCanvas, readPsd, type Layer, type Psd } from 'ag-psd'
import sharp from 'sharp'
import { entryPath, openArchiveEntry } from '../../src/main/import/archive'
import { scanForPsds } from '../../src/main/import/scanner'
import { copyWithHash } from '../../src/main/import/stream-copy'
import { COVERS_DIR, EVAL_DIR, argValue, readItems, realItemPaths, writeJson, zipDir } from './eval-files'

initializeCanvas(
  () => {
    throw new Error('no canvas: read with useImageData')
  },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' }) as ImageData
)

/** Names a designer's own content goes into. */
const DESIGN =
  /change this|your design|design here|put your|place your|edit (?:content|me)|insert|replace|double.?click|smart.?object|\bscreens?\b|\bdisplay\b|\bcover\b|\blabel\b|\bdesign\b|\bartwork\b|\blogo\b|\bprint\b|\bposter\b|\bimage\b|\bpicture\b|\bphoto\b|\byour\b|\bhere\b|\bpage\b|\bwallpaper\b/i
/** Scene parts and overlays, never the design. */
const SCENE =
  /\b(?:base|object|shadows?|background|bg|reflex|reflections?|highlights?|lights?|glare|colou?rs?|fx|overlays?|remove|delete|mask|body|frame|device)\b/i

export interface SlotInfo {
  docWidth: number
  docHeight: number
  slots: { name: string; path: string }[]
  /** Share of the cover the mask covers, 0 to 1. */
  coverage: number
  /** Whether slot-mask.png lines up with the cover. */
  fits: boolean
  note?: string
}

interface Flat {
  layer: Layer
  path: string[]
  /** Index in paint order, bottom first. */
  order: number
  clipBase: Layer | null
  /** Painted plainly: a normal, opaque layer whose groups blend normally too. */
  plain: boolean
}

/** Visible leaf layers in paint order, each with its group path and clipping base. */
function flatten(psd: Psd): Flat[] {
  const out: Flat[] = []
  const opaque = (l: Layer) => (l.opacity ?? 1) >= 0.9 && (l.fillOpacity ?? 1) >= 0.9
  const walk = (layers: Layer[] | undefined, path: string[], plainGroups: boolean) => {
    let base: Layer | null = null
    for (const layer of layers ?? []) {
      if (!layer.clipping) base = layer
      if (layer.hidden) continue
      if (layer.children) {
        const plain = plainGroups && opaque(layer) && ['pass through', 'normal'].includes(layer.blendMode ?? 'pass through')
        walk(layer.children, [...path, layer.name ?? ''], plain)
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

function isSlot(f: Flat): boolean {
  if (!f.layer.placedLayer) return false
  const name = f.layer.name ?? ''
  if (SCENE.test(name)) return false
  return DESIGN.test(name) || f.path.some((p) => DESIGN.test(p) && !SCENE.test(p))
}

/** Slots by name, or when no layer is named like one, every visible smart object that isn't a scene part ("Leggings"). */
function findSlots(flat: Flat[]): Flat[] {
  const named = flat.filter(isSlot)
  if (named.length > 0) return named
  return flat.filter((f) => f.layer.placedLayer && !SCENE.test(f.layer.name ?? ''))
}

/** A layer's own alpha (0 to 1) at a document pixel, with its layer mask. */
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
    if (m && x >= ml && y >= mt && x < ml + m.width && y < mt + m.height)
      v = m.data[((y - mt) * m.width + (x - ml)) * 4]! / 255
    a *= v
  }
  return a
}

function overlaps(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
}

function boundsOf(layer: Layer): [number, number, number, number] {
  return [layer.left ?? 0, layer.top ?? 0, layer.right ?? 0, layer.bottom ?? 0]
}

/** The document-sized mask (one byte per pixel, 255 = placeholder) and the slots it came from. */
function slotMask(psd: Psd): { mask: Uint8Array; slots: Flat[] } {
  const w = psd.width
  const h = psd.height
  const flat = flatten(psd)
  const slots = findSlots(flat)
  const mask = new Uint8Array(w * h)
  // Plain layers painted over a slot hide it: a hand over a screen, a lid over a label, a higher
  // colourway's background over a lower one. Overlay notices ("Remove this layer") never count.
  const occluders = flat.filter(
    (f) => f.plain && !slots.includes(f) && !/\b(?:fx|overlays?|remove|delete)\b/i.test([...f.path, f.layer.name ?? ''].join(' '))
  )
  for (const s of slots) {
    const [l, t, r, b] = boundsOf(s.layer)
    const above = occluders.filter((c) => c.order > s.order && overlaps(boundsOf(c.layer), [l, t, r, b]))
    for (let y = Math.max(0, t); y < Math.min(h, b); y++) {
      for (let x = Math.max(0, l); x < Math.min(w, r); x++) {
        let a = alphaAt(s.layer, x, y)
        if (a > 0 && s.clipBase) a *= alphaAt(s.clipBase, x, y)
        if (a < 0.5) continue
        const hidden = above.some((c) => {
          let ca = alphaAt(c.layer, x, y)
          if (ca > 0 && c.clipBase) ca *= alphaAt(c.clipBase, x, y)
          return ca >= 0.9
        })
        if (!hidden) mask[y * w + x] = 255
      }
    }
  }
  return { mask, slots }
}

async function writeOutputs(id: string, coverPath: string, psd: Psd, mask: Uint8Array, slots: Flat[]): Promise<SlotInfo> {
  const dir = join(COVERS_DIR, id)
  const meta = await sharp(coverPath).metadata()
  const cw = meta.width!
  const ch = meta.height!
  const docAspect = psd.width / psd.height
  const fits = Math.abs(cw / ch - docAspect) / docAspect < 0.015
  const info: SlotInfo = {
    docWidth: psd.width,
    docHeight: psd.height,
    slots: slots.map((s) => ({ name: s.layer.name ?? '', path: [...s.path, s.layer.name ?? ''].join(' / ') })),
    coverage: 0,
    fits: fits && slots.length > 0
  }
  if (!fits) info.note = `cover ${cw}x${ch} does not match the document ${psd.width}x${psd.height}`
  if (slots.length === 0) info.note = 'no design slot found'
  const coverMask = await sharp(Buffer.from(mask), { raw: { width: psd.width, height: psd.height, channels: 1 } })
    .resize(cw, ch, { fit: 'fill' })
    .threshold(128)
    .png()
    .toBuffer()
  const stats = await sharp(coverMask).stats()
  info.coverage = +(stats.channels[0]!.mean / 255).toFixed(4)
  if (info.fits) await sharp(coverMask).toFile(join(dir, 'slot-mask.png'))
  else rmSync(join(dir, 'slot-mask.png'), { force: true })
  // For people: the cover, dimmed outside the mask.
  const dim = await sharp(coverPath).flatten({ background: '#ffffff' }).modulate({ brightness: 0.35 }).png().toBuffer()
  const lit = await sharp(coverPath).flatten({ background: '#ffffff' }).joinChannel(coverMask).png().toBuffer()
  const shown = await sharp(dim).composite([{ input: lit }]).png().toBuffer()
  await sharp(shown)
    .resize(768, 768, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toFile(join(dir, 'placeholder.jpg'))
  writeJson(join(dir, 'slots.json'), info)
  return info
}

async function main(): Promise<void> {
  const only = argValue('only')?.split(',').filter(Boolean) ?? null
  const items = readItems().filter((i) => !i.duplicateOf && i.coverPath && (!only || only.includes(i.id)))
  const stagingDir = join(EVAL_DIR, 'staging')
  const tmpDir = join(EVAL_DIR, 'tmp')
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const scan = await scanForPsds(realItemPaths(), { stagingDir })
  const bySource = new Map(
    scan.psds.map((p) => [p.archive ? entryPath(join(zipDir(p.archive.name), p.archive.name), p.archive.entry) : p.psdPath, p])
  )
  const rows: Record<string, unknown>[] = []
  for (const item of items) {
    const p = bySource.get(item.source.path)
    if (!p) {
      console.log(`skip  ${item.id}: not found in the scan`)
      continue
    }
    const tmpPsd = join(tmpDir, `${item.id}.psd`)
    try {
      const archive = p.archive
      await copyWithHash(archive ? () => openArchiveEntry(archive.path, archive.entry) : p.psdPath, tmpPsd)
      const bytes = readFileSync(tmpPsd)
      const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
        skipCompositeImageData: true,
        skipThumbnail: true,
        skipLinkedFilesData: true,
        useImageData: true
      })
      const { mask, slots } = slotMask(psd)
      const info = await writeOutputs(item.id, item.coverPath, psd, mask, slots)
      rows.push({ id: item.id, cover: item.coverSource, slots: info.slots.map((s) => s.name).join(', '), coverage: info.coverage, fits: info.fits, note: info.note ?? '' })
      console.log(`slots ${item.id}: ${info.slots.length} (${(info.coverage * 100).toFixed(1)}%)${info.fits ? '' : ' NO FIT'}`)
    } catch (err) {
      console.log(`FAIL  ${item.id}: ${(err as Error).message}`)
    } finally {
      rmSync(tmpPsd, { force: true })
    }
  }
  rmSync(stagingDir, { recursive: true, force: true })
  console.table(rows)
  if (!existsSync(COVERS_DIR)) return
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
