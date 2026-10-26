/// <reference types="electron-vite/node" />
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Mockup } from '../db/schema'
import { SLOT_MASK_FILE, slotMaskSettled, type SlotMaskOutcome } from './design-slot'
import createWorker from './design-slot.worker?nodeWorker'

/** Longest a slot mask may take before the worker is stopped (the largest test PSD took about 4 s). */
const SLOT_MASK_TIMEOUT_MS = 60_000

/** The worker died or ran out of time: nothing is known about the PSD, so nothing is kept about it. */
export type SlotMaskRun = SlotMaskOutcome | 'failed'

const OUTCOMES: readonly unknown[] = ['written', 'no-slot', 'other-shape', 'unreadable', 'too-large'] satisfies SlotMaskOutcome[]

/**
 * `writeDesignSlotMask` in a worker thread of its own. Reading a PSD takes up to a few seconds and,
 * for the layers a mask needs, up to the decode budget, so the main thread never blocks on it and the
 * memory goes when the worker exits. `failed` on a crash or timeout: the AI then sees the cover as it
 * is, and the PSD is read again next time.
 */
export function writeDesignSlotMaskInWorker(psdPath: string, coverPath: string, outPath: string): Promise<SlotMaskRun> {
  return new Promise((resolve) => {
    const worker = createWorker({ workerData: { psdPath, coverPath, outPath } })
    let settled = false
    const done = (run: SlotMaskRun) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(run)
      void worker.terminate()
    }
    const timer = setTimeout(() => done('failed'), SLOT_MASK_TIMEOUT_MS)
    worker.once('message', (outcome: unknown) => done(OUTCOMES.includes(outcome) ? (outcome as SlotMaskOutcome) : 'failed'))
    worker.once('error', () => done('failed'))
    worker.once('exit', () => done('failed'))
  })
}

/**
 * Writes a mockup's slot mask when its folder doesn't yet say what its PSD gives: for one imported
 * before masks were made at import, or before a PSD with no mask was remembered. A PSD that gave a
 * mask or none is never read again. Only for the PSD's own preview or its sidecar; a cover the
 * person chose never gets one, since the document's slot need not line up with it.
 */
export async function ensureSlotMask(
  m: Pick<Mockup, 'libraryPath' | 'coverPath' | 'coverSource'>,
  write: (psdPath: string, coverPath: string, outPath: string) => Promise<SlotMaskRun> = writeDesignSlotMaskInWorker
): Promise<void> {
  if (!m.coverPath || (m.coverSource !== 'embedded' && m.coverSource !== 'sidecar')) return
  const dir = dirname(m.coverPath)
  if (slotMaskSettled(dir) || !existsSync(m.libraryPath)) return
  await write(m.libraryPath, m.coverPath, join(dir, SLOT_MASK_FILE))
}
