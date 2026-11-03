import { open, type FileHandle } from 'node:fs/promises'
import { readPsd, initializeCanvas } from 'ag-psd'
import { MIN_EMBEDDED_EDGE } from '@shared/constants'
import type { RawImage } from './types'

// ag-psd needs a createImageData shim when running without node-canvas.
// We only ever use useImageData:true (raw RGBA), so a plain Uint8ClampedArray is sufficient.
initializeCanvas(
  () => { throw new Error('ag-psd canvas not supported — use useImageData:true') },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' })
)

/** The header: signature, version, then the image's size and mode, 26 bytes in all. */
const HEADER_BYTES = 26

async function readFully(file: FileHandle, into: Buffer, offset: number, length: number, position: number): Promise<void> {
  let done = 0
  while (done < length) {
    const { bytesRead } = await file.read(into, offset + done, length - done, position + done)
    if (bytesRead === 0) throw new Error('The PSD ends early')
    done += bytesRead
  }
}

/**
 * The parts of a PSD its composite needs, laid out as a file ag-psd can read: the header, the colour
 * and image resource sections, an empty layer section, then the composite. The layer section holds
 * every layer's pixels and is most of a big file, so it is never read. `mergedAlpha` keeps the one
 * thing the composite takes from it: a negative layer count, which says the merged result is see-through.
 */
export async function readCompositeSections(psdPath: string): Promise<{ bytes: ArrayBuffer; mergedAlpha: boolean }> {
  const file = await open(psdPath, 'r')
  try {
    const { size } = await file.stat()
    const at = async (position: number, length: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(length)
      await readFully(file, buffer, 0, length, position)
      return buffer
    }
    const header = await at(0, HEADER_BYTES)
    if (header.toString('latin1', 0, 4) !== '8BPS') throw new Error('Not a PSD')
    // A Large Document Format file (.psb) gives the layer section's lengths in 8 bytes.
    const lengthBytes = header.readUInt16BE(4) === 2 ? 8 : 4
    const lengthAt = async (position: number): Promise<number> => {
      const field = await at(position, lengthBytes)
      return lengthBytes === 8 ? Number(field.readBigUInt64BE(0)) : field.readUInt32BE(0)
    }

    let position = HEADER_BYTES
    position += 4 + (await at(position, 4)).readUInt32BE(0) // colour mode data
    position += 4 + (await at(position, 4)).readUInt32BE(0) // image resources
    const layersAt = position
    const layersLength = await lengthAt(layersAt)
    const compositeAt = layersAt + lengthBytes + layersLength
    if (compositeAt > size) throw new Error('The PSD ends early')

    // The layer info comes first in the layer section: its length, then the layer count.
    const layerInfoLength = layersLength > 0 ? await lengthAt(layersAt + lengthBytes) : 0
    const mergedAlpha =
      layerInfoLength >= 2 && (await at(layersAt + 2 * lengthBytes, 2)).readInt16BE(0) < 0

    // The layer section's own length stays 0: Buffer.alloc fills with zeros.
    const out = Buffer.alloc(layersAt + lengthBytes + (size - compositeAt))
    await readFully(file, out, 0, layersAt, 0)
    await readFully(file, out, layersAt + lengthBytes, size - compositeAt, compositeAt)
    const whole = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
    return {
      bytes: (whole ? out.buffer : out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)) as ArrayBuffer,
      mergedAlpha
    }
  } finally {
    await file.close()
  }
}

/**
 * Undo the white Photoshop mixes into a see-through composite's part-clear pixels, as ag-psd does
 * when it reads the whole file (it knows from the layer count, which this read leaves out).
 */
function removeWhiteMatte(p: Uint8ClampedArray): void {
  for (let i = 0; i < p.length; i += 4) {
    const pa = p[i + 3]!
    if (pa === 0 || pa === 255) continue
    const ra = 1 / (pa / 255)
    const invA = 255 * (1 - ra)
    p[i] = p[i]! * ra + invA
    p[i + 1] = p[i + 1]! * ra + invA
    p[i + 2] = p[i + 2]! * ra + invA
  }
}

/**
 * The PSD's own composite, as raw RGBA, or null when there is none or it is too small to be a cover.
 * Only the composite is read and decoded (`readCompositeSections`), never the layers.
 */
export async function readEmbeddedPreview(psdPath: string): Promise<RawImage | null> {
  const { bytes, mergedAlpha } = await readCompositeSections(psdPath)
  const psd = readPsd(bytes, {
    skipLayerImageData: true,
    skipCompositeImageData: false,
    useImageData: true,
  })

  const imageData = psd.imageData
  if (!imageData) return null

  const longEdge = Math.max(imageData.width, imageData.height)
  if (longEdge < MIN_EMBEDDED_EDGE) return null

  if (mergedAlpha && psd.bitsPerChannel === 8 && imageData.data instanceof Uint8ClampedArray) {
    removeWhiteMatte(imageData.data)
  }

  return {
    data: Buffer.from(imageData.data.buffer),
    width: imageData.width,
    height: imageData.height,
  }
}
