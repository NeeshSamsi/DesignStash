import { readFile } from 'node:fs/promises'
import { readPsd, initializeCanvas } from 'ag-psd'
import { MIN_EMBEDDED_EDGE } from '@shared/constants'
import type { RawImage } from './types'

// ag-psd needs a createImageData shim when running without node-canvas.
// We only ever use useImageData:true (raw RGBA), so a plain Uint8ClampedArray is sufficient.
initializeCanvas(
  () => { throw new Error('ag-psd canvas not supported — use useImageData:true') },
  (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
)

export async function readEmbeddedPreview(psdPath: string): Promise<RawImage | null> {
  const bytes = await readFile(psdPath)
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const psd = readPsd(ab, {
    skipLayerImageData: true,
    skipCompositeImageData: false,
    useImageData: true,
  })

  const imageData = psd.imageData
  if (!imageData) return null

  const longEdge = Math.max(imageData.width, imageData.height)
  if (longEdge < MIN_EMBEDDED_EDGE) return null

  return {
    data: Buffer.from(imageData.data.buffer),
    width: imageData.width,
    height: imageData.height,
  }
}
