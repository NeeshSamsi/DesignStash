/// <reference types="electron-vite/node" />
import createWorker from './design-slot.worker?nodeWorker'

/** Longest a slot mask may take before the worker is stopped (the largest test PSD took about 4 s). */
const SLOT_MASK_TIMEOUT_MS = 60_000

/**
 * `writeDesignSlotMask` in a worker thread of its own. Reading a PSD's layer pixels can take seconds
 * and a gigabyte for a large document, so the main process never blocks on it and the memory goes
 * when the worker exits. False on any failure or timeout: the AI then sees the cover as it is.
 */
export function writeDesignSlotMaskInWorker(psdPath: string, coverPath: string, outPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const worker = createWorker({ workerData: { psdPath, coverPath, outPath } })
    let settled = false
    const done = (wrote: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(wrote)
      void worker.terminate()
    }
    const timer = setTimeout(() => done(false), SLOT_MASK_TIMEOUT_MS)
    worker.once('message', (wrote: unknown) => done(wrote === true))
    worker.once('error', () => done(false))
    worker.once('exit', () => done(false))
  })
}
