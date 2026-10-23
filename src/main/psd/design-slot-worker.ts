/// <reference types="electron-vite/node" />
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Mockup } from '../db/schema'
import { SLOT_MASK_FILE } from './design-slot'
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

/**
 * Writes a mockup's slot mask when it has none: for one imported before masks were made at import.
 * Only for the PSD's own preview or its sidecar; a cover the person chose never gets one, since the
 * document's slot need not line up with it.
 */
export async function ensureSlotMask(m: Pick<Mockup, 'libraryPath' | 'coverPath' | 'coverSource'>): Promise<void> {
  if (!m.coverPath || (m.coverSource !== 'embedded' && m.coverSource !== 'sidecar')) return
  const out = join(dirname(m.coverPath), SLOT_MASK_FILE)
  if (existsSync(out) || !existsSync(m.libraryPath)) return
  await writeDesignSlotMaskInWorker(m.libraryPath, m.coverPath, out)
}
