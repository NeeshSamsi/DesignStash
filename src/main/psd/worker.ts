import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { RawImage } from './types'

// electron-vite bundles the worker as psd-reader.worker.mjs (ESM) in out/main/.
// __dirname is injected by electron-vite for both dev and packaged builds.
function workerScriptPath(): string {
  return join(__dirname, 'psd-reader.worker.mjs')
}

type WorkerResponse =
  | { ok: true; result: { data: ArrayBuffer; width: number; height: number } | null }
  | { ok: false; error: string }

export function readEmbeddedPreviewInWorker(psdPath: string): Promise<RawImage | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScriptPath())
    worker.postMessage({ psdPath })

    worker.once('message', (msg: WorkerResponse) => {
      void worker.terminate()
      if (!msg.ok) {
        reject(new Error(msg.error))
        return
      }
      if (msg.result === null) {
        resolve(null)
        return
      }
      resolve({
        data: Buffer.from(msg.result.data),
        width: msg.result.width,
        height: msg.result.height,
      })
    })

    worker.once('error', (err) => {
      void worker.terminate()
      reject(err)
    })
  })
}
