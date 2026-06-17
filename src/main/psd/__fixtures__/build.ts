import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { writePsdBuffer } from 'ag-psd'
import { initializeCanvas } from 'ag-psd'
import sharp from 'sharp'

// ag-psd needs a canvas shim for reading; for writing we only use imageData directly.
// Initialize here so fixture-building code is self-contained in tests.
initializeCanvas(
  () => { throw new Error('ag-psd canvas not supported — use useImageData:true') },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
)

export interface CompositeOptions {
  width?: number
  height?: number
  color?: { r: number; g: number; b: number }
}

/** Writes a PSD with a composite image ≥ MIN_EMBEDDED_EDGE on its long edge. */
export function buildPsdWithComposite(
  path: string,
  { width = 1024, height = 768, color = { r: 200, g: 150, b: 100 } }: CompositeOptions = {}
): void {
  mkdirSync(dirname(path), { recursive: true })
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color.r
    data[i + 1] = color.g
    data[i + 2] = color.b
    data[i + 3] = 255
  }
  const buf = writePsdBuffer({
    width,
    height,
    imageData: { data, width, height },
    children: [],
  })
  writeFileSync(path, buf)
}

/** Writes a PSD with a composite smaller than MIN_EMBEDDED_EDGE (100×100). */
export function buildPsdSmallComposite(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const w = 100
  const h = 100
  const data = new Uint8ClampedArray(w * h * 4).fill(128)
  const buf = writePsdBuffer({
    width: w,
    height: h,
    imageData: { data, width: w, height: h },
    children: [],
  })
  writeFileSync(path, buf)
}

export interface SidecarOptions {
  width?: number
  height?: number
  format?: 'jpeg' | 'png' | 'webp'
}

/** Creates a solid-color image file via sharp (jpeg/png/webp). */
export async function buildSidecarImage(
  path: string,
  { width = 800, height = 600, format = 'jpeg' }: SidecarOptions = {}
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true })
  const img = sharp({
    create: { width, height, channels: 3, background: { r: 128, g: 64, b: 32 } },
  })
  switch (format) {
    case 'jpeg':
      await img.jpeg({ quality: 80 }).toFile(path)
      break
    case 'png':
      await img.png().toFile(path)
      break
    case 'webp':
      await img.webp({ quality: 80 }).toFile(path)
      break
  }
}

export interface DroppedTree {
  psdPaths: string[]
  jpgPaths: string[]
}

/**
 * Builds the canonical sidecar fixture layout:
 *   rootDir/PSD/{A,B,C}.psd  — small composite (unusable embedded preview)
 *   rootDir/JPG/{A,B,C}.jpg  — matching sidecar images
 *   rootDir/noise.txt         — non-image noise
 *   rootDir/JPG/unrelated.jpg — image with no matching PSD
 */
export async function buildDroppedTree(rootDir: string): Promise<DroppedTree> {
  const stems = ['Artboard A', 'Artboard B', 'Artboard C']
  const psdDir = join(rootDir, 'PSD')
  const jpgDir = join(rootDir, 'JPG')
  mkdirSync(psdDir, { recursive: true })
  mkdirSync(jpgDir, { recursive: true })

  const psdPaths: string[] = []
  const jpgPaths: string[] = []

  for (const stem of stems) {
    const psdPath = join(psdDir, `${stem}.psd`)
    buildPsdSmallComposite(psdPath)
    psdPaths.push(psdPath)

    const jpgPath = join(jpgDir, `${stem}.jpg`)
    await buildSidecarImage(jpgPath, { width: 800, height: 600, format: 'jpeg' })
    jpgPaths.push(jpgPath)
  }

  // Noise files
  writeFileSync(join(rootDir, 'noise.txt'), 'not an image')
  await buildSidecarImage(join(jpgDir, 'unrelated.jpg'), { format: 'jpeg' })

  return { psdPaths, jpgPaths }
}
