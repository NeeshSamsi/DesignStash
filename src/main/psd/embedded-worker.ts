/// <reference types="electron-vite/node" />
import { readEmbeddedPreview } from './embedded'
import type { RawImage } from './types'
import createWorker from './embedded.worker?nodeWorker'

/**
 * Longest a PSD's composite may take to read before the worker is stopped. The largest test PSD
 * read in a few seconds; a slow network drive gets ample room.
 */
const EMBEDDED_TIMEOUT_MS = 120_000

/** The part of a worker this needs, so a test can hand in a stand-in. */
export interface PreviewWorker {
  once(event: 'message', listener: (message: unknown) => void): unknown
  once(event: 'error' | 'exit', listener: () => void): unknown
  terminate(): Promise<number>
}

export type SpawnPreviewWorker = (options: { workerData: { psdPath: string } }) => PreviewWorker

export interface PreviewWorkerOptions {
  spawn?: SpawnPreviewWorker
  timeoutMs?: number
  /** Reads it on this thread when no worker can be started. */
  readHere?: (psdPath: string) => Promise<RawImage | null>
}

/**
 * `readEmbeddedPreview` in a worker thread of its own, so reading and decoding a big PSD never blocks
 * the main thread, and its memory goes when the worker exits. Null (no preview this time) when the
 * worker dies or runs out of time; a PSD the worker can't read rejects, as reading it here would.
 * A worker that can't be started at all falls back to reading here, so imports keep their covers.
 */
export function readEmbeddedPreviewInWorker(
  psdPath: string,
  {
    spawn = createWorker,
    timeoutMs = EMBEDDED_TIMEOUT_MS,
    readHere = readEmbeddedPreview
  }: PreviewWorkerOptions = {}
): Promise<RawImage | null> {
  let worker: PreviewWorker
  try {
    worker = spawn({ workerData: { psdPath } })
  } catch {
    return readHere(psdPath)
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (settle: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      settle()
      void worker.terminate()
    }
    const timer = setTimeout(() => done(() => resolve(null)), timeoutMs)
    worker.once('message', (message: unknown) => done(() => settleMessage(message, resolve, reject)))
    worker.once('error', () => done(() => resolve(null)))
    worker.once('exit', () => done(() => resolve(null)))
  })
}

function settleMessage(
  message: unknown,
  resolve: (raw: RawImage | null) => void,
  reject: (err: Error) => void
): void {
  const m = message as { ok?: unknown; image?: { width?: unknown; height?: unknown; data?: unknown } | null }
  if (m?.ok !== true) return reject(new Error('The PSD could not be read'))
  if (m.image === null) return resolve(null)
  const { width, height, data } = m.image ?? {}
  if (typeof width !== 'number' || typeof height !== 'number' || !(data instanceof ArrayBuffer)) {
    return resolve(null)
  }
  resolve({ data: Buffer.from(data), width, height })
}
