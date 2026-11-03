import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { writeDesignSlotMask } from './design-slot'

/** Runs `writeDesignSlotMask` off the main thread: one PSD per worker, which then exits. */
// Loaded outside a worker (as tests resolve the `?nodeWorker` import), it does nothing.
if (!isMainThread && workerData) {
  const { psdPath, coverPath, outPath } = workerData as { psdPath: string; coverPath: string; outPath: string }
  void writeDesignSlotMask(psdPath, coverPath, outPath).then((wrote) => parentPort?.postMessage(wrote))
}
