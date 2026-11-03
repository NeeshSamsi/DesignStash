import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEmbeddedPreviewInWorker, type PreviewWorker } from './embedded-worker'

/** A stand-in worker: the test says what it posts, or how it ends. */
function fakeWorker() {
  const events = new EventEmitter()
  const terminate = vi.fn(async () => 0)
  const worker = {
    once: (event: string, listener: (...args: unknown[]) => void) => events.once(event, listener),
    terminate
  } as unknown as PreviewWorker
  const spawned: { psdPath: string }[] = []
  const spawn = (options: { workerData: { psdPath: string } }) => {
    spawned.push(options.workerData)
    return worker
  }
  return { events, terminate, spawn, spawned }
}

afterEach(() => vi.useRealTimers())

describe('readEmbeddedPreviewInWorker', () => {
  it('hands back the composite the worker read, and stops the worker', async () => {
    const w = fakeWorker()
    const pixels = new Uint8Array([1, 2, 3, 255]).buffer
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', { spawn: w.spawn })

    w.events.emit('message', { ok: true, image: { width: 1, height: 1, data: pixels } })

    const raw = await read
    expect(w.spawned).toEqual([{ psdPath: '/stash/a.psd' }])
    expect(raw).toMatchObject({ width: 1, height: 1 })
    expect([...raw!.data]).toEqual([1, 2, 3, 255])
    expect(w.terminate).toHaveBeenCalled()
  })

  it('has no preview when the PSD has none', async () => {
    const w = fakeWorker()
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', { spawn: w.spawn })
    w.events.emit('message', { ok: true, image: null })
    await expect(read).resolves.toBeNull()
  })

  it('fails as reading it here would when the PSD cannot be read', async () => {
    const w = fakeWorker()
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', { spawn: w.spawn })
    w.events.emit('message', { ok: false })
    await expect(read).rejects.toThrow()
  })

  it('has no preview this time when the worker dies', async () => {
    const w = fakeWorker()
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', { spawn: w.spawn })
    w.events.emit('error', new Error('out of memory'))
    await expect(read).resolves.toBeNull()
  })

  it('reads it on this thread when no worker can be started', async () => {
    const raw = { data: Buffer.from([9, 9, 9, 255]), width: 1, height: 1 }
    const readHere = vi.fn(async () => raw)
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', {
      spawn: () => {
        throw new Error('no worker file')
      },
      readHere
    })
    await expect(read).resolves.toBe(raw)
    expect(readHere).toHaveBeenCalledWith('/stash/a.psd')
  })

  it('stops a worker that takes too long, with no preview', async () => {
    vi.useFakeTimers()
    const w = fakeWorker()
    const read = readEmbeddedPreviewInWorker('/stash/a.psd', { spawn: w.spawn, timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    await expect(read).resolves.toBeNull()
    expect(w.terminate).toHaveBeenCalled()
  })
})
