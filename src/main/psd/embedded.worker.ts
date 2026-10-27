import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { readEmbeddedPreview } from './embedded'

/**
 * Runs `readEmbeddedPreview` off the main thread: one PSD per worker, which then exits. Posts the
 * composite's pixels (moved, not copied), null when there is none, or that the PSD can't be read.
 */
// Loaded outside a worker (as tests resolve the `?nodeWorker` import), it does nothing.
if (!isMainThread && workerData) {
  const { psdPath } = workerData as { psdPath: string }
  readEmbeddedPreview(psdPath).then(
    (raw) => {
      if (!raw) return parentPort?.postMessage({ ok: true, image: null })
      const { data, width, height } = raw
      const pixels =
        data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
          ? data.buffer
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      parentPort?.postMessage({ ok: true, image: { width, height, data: pixels } }, [pixels as ArrayBuffer])
    },
    () => parentPort?.postMessage({ ok: false })
  )
}
