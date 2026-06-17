import { parentPort } from 'node:worker_threads'
import { readEmbeddedPreview } from './embedded'
import type { RawImage } from './types'

interface WorkerRequest {
  psdPath: string
}

type WorkerResponse =
  | { ok: true; result: { data: ArrayBuffer; width: number; height: number } | null }
  | { ok: false; error: string }

parentPort?.on('message', async ({ psdPath }: WorkerRequest) => {
  try {
    const raw: RawImage | null = await readEmbeddedPreview(psdPath)
    if (raw === null) {
      parentPort?.postMessage({ ok: true, result: null } satisfies WorkerResponse)
      return
    }
    // Transfer the underlying ArrayBuffer to avoid copying across thread boundary
    const ab = raw.data.buffer.slice(
      raw.data.byteOffset,
      raw.data.byteOffset + raw.data.byteLength
    ) as ArrayBuffer
    const msg: WorkerResponse = { ok: true, result: { data: ab, width: raw.width, height: raw.height } }
    parentPort?.postMessage(msg, [ab])
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: String(err) } satisfies WorkerResponse)
  }
})
