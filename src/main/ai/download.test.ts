import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { classifyDownloadError, DownloadError, ModelDownloader, type DownloadProgress } from './download'
import * as registry from './registry'
import type { ModelTier } from './hardware'

// Mock registry: two 60 and 40 byte files, so a model is 100 bytes.
const A = Buffer.from(''.padStart(60, 'a'))
const B = Buffer.from(''.padStart(40, 'b'))
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const makeModel = (id: string, sums: boolean) => ({
  id,
  name: id,
  tier: 'small' as ModelTier,
  description: '',
  languages: ['English'],
  quality: 3,
  speed: 3,
  minMemoryGB: 8,
  sizeBytes: 100,
  files: {
    model: { url: `http://test.com/${id}/big.gguf`, sizeBytes: 60, sha256: sums ? sha(A) : null },
    mmproj: { url: `http://test.com/${id}/proj.gguf`, sizeBytes: 40, sha256: sums ? sha(B) : null }
  }
})
const mockModel = makeModel('test-model', true)
const mockModelNoSha = makeModel('test-model-nohash', false)

vi.spyOn(registry, 'getModel').mockImplementation((id) => {
  if (id === 'test-model') return mockModel
  if (id === 'test-model-nohash') return mockModelNoSha
  return undefined
})

let tempModelsDir: string

beforeEach(async () => {
  tempModelsDir = await fs.mkdtemp(join(tmpdir(), 'designstash-test-models-'))
})

afterEach(async () => {
  await fs.rm(tempModelsDir, { recursive: true, force: true })
})

/** Serves A for the model url and B for the mmproj url, with Range support. */
function createMockFetch(files: { big: Buffer; proj: Buffer } = { big: A, proj: B }, chunkSize = 10) {
  return vi.fn().mockImplementation(async (url: string, opts: RequestInit = {}) => {
    let data = String(url).endsWith('proj.gguf') ? files.proj : files.big
    const range = opts.headers ? new Headers(opts.headers).get('Range') : null
    if (range) data = data.subarray(Number(range.replace('bytes=', '').split('-')[0]))

    const stream = new Readable({
      read() {
        for (let i = 0; i < data.length; i += chunkSize) this.push(data.subarray(i, i + chunkSize))
        this.push(null)
      }
    })
    return new Response(stream as unknown as ReadableStream, {
      status: range ? 206 : 200,
      headers: { 'content-length': String(data.length) }
    })
  })
}

describe('ModelDownloader', () => {
  it('downloads both files to model.gguf and mmproj.gguf and reports one combined progress figure', async () => {
    const fetchImpl = createMockFetch()
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })
    const onProgress = vi.fn()

    await downloader.download('test-model', { onProgress })

    const dir = join(tempModelsDir, 'test-model')
    expect((await fs.readFile(join(dir, 'model.gguf'))).equals(A)).toBe(true)
    expect((await fs.readFile(join(dir, 'mmproj.gguf'))).equals(B)).toBe(true)
    expect(await fs.readdir(dir)).not.toContain('model.gguf.part')

    const calls = onProgress.mock.calls.map(([p]) => p)
    expect(calls.every((p) => p.totalBytes === 100)).toBe(true)
    const downloading = calls.filter((p) => p.phase === 'downloading').map((p) => p.receivedBytes)
    expect(downloading).toEqual([...downloading].sort((a, b) => a - b))
    // The second file carries on from where the first ended.
    expect(downloading.some((n) => n > 60)).toBe(true)
    expect(calls.at(-1)).toMatchObject({ phase: 'done', receivedBytes: 100, totalBytes: 100 })
    expect(calls.some((p) => p.phase === 'verifying')).toBe(true)
    expect(await downloader.isInstalled('test-model')).toBe(true)
  })

  it('is not installed until both files are there', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf'), 'x')
    expect(await downloader.isInstalled('test-model')).toBe(false)
    await fs.writeFile(join(dir, 'mmproj.gguf'), 'y')
    expect(await downloader.isInstalled('test-model')).toBe(true)
  })

  it('fails and cleans up when a checksum is wrong', async () => {
    const downloader = new ModelDownloader(tempModelsDir, {
      fetchImpl: createMockFetch({ big: Buffer.from(''.padStart(60, 'x')), proj: B })
    })

    await expect(downloader.download('test-model')).rejects.toHaveProperty('reason', 'checksum')

    const dir = join(tempModelsDir, 'test-model')
    expect(await fs.readdir(dir)).toEqual([])
    expect(await downloader.isInstalled('test-model')).toBe(false)
  })

  it('can be cancelled', async () => {
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl: createMockFetch() })
    const controller = new AbortController()

    const promise = downloader.download('test-model', { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toHaveProperty('name', 'AbortError')
  })

  it('resumes a partly downloaded file with a Range request', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf.part'), A.subarray(0, 25))
    const fetchImpl = createMockFetch()

    await new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model')

    const first = fetchImpl.mock.calls[0]!
    expect(new Headers(first[1].headers).get('Range')).toBe('bytes=25-')
    expect((await fs.readFile(join(dir, 'model.gguf'))).equals(A)).toBe(true)
  })

  it('keeps a finished first file when the second one has to be retried', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf'), A)
    const fetchImpl = createMockFetch()

    await new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('proj.gguf')
  })

  it('lists, checks for and deletes installed models', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    expect(await downloader.listInstalled()).toEqual([])

    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf'), '')
    await fs.writeFile(join(dir, 'mmproj.gguf'), '')
    expect(await downloader.listInstalled()).toEqual(['test-model'])

    await downloader.deleteModel('test-model')
    expect(await downloader.isInstalled('test-model')).toBe(false)
    await expect(fs.stat(dir)).rejects.toThrow()
  })

  it('skips the integrity check when there is no sha256', async () => {
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl: createMockFetch() })
    await downloader.download('test-model-nohash')
    expect(await downloader.isInstalled('test-model-nohash')).toBe(true)
  })
})

const failureOf = async (promise: Promise<unknown>) => {
  const err = await promise.then(() => null, (e: unknown) => e)
  return err instanceof DownloadError ? err.reason : (err as Error | null)?.name
}

describe('failure reasons', () => {
  it('says offline when the network cannot be reached, and leaves nothing behind', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }) })
    )
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })

    expect(await failureOf(downloader.download('test-model'))).toBe('offline')
    expect(await downloader.isInstalled('test-model')).toBe(false)
  })

  it('says offline for a bare fetch failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    expect(await failureOf(new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model'))).toBe('offline')
  })

  it.each([404, 500, 503])('says server for an HTTP %i', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('no', { status }))
    expect(await failureOf(new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model'))).toBe('server')
  })

  it('says server when the answer ends early', async () => {
    const fetchImpl = createMockFetch({ big: A.subarray(0, 30), proj: B })
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })
    expect(await failureOf(downloader.download('test-model'))).toBe('server')
    // What arrived is kept for the retry.
    expect((await fs.stat(join(tempModelsDir, 'test-model', 'model.gguf.part'))).size).toBe(30)
  })

  it('says checksum when a file does not match', async () => {
    const fetchImpl = createMockFetch({ big: A, proj: Buffer.from(''.padStart(40, 'z')) })
    expect(await failureOf(new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model'))).toBe('checksum')
  })

  it('says disk-full before downloading anything when there is no room', async () => {
    const fetchImpl = createMockFetch()
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl, freeBytes: async () => 50 })

    expect(await failureOf(downloader.download('test-model'))).toBe('disk-full')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('only needs room for what is left when part of it is already there', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf'), A)
    // Margin is 256 MB; 40 bytes remain, so a little over the margin is enough.
    const downloader = new ModelDownloader(tempModelsDir, {
      fetchImpl: createMockFetch(),
      freeBytes: async () => 256 * 1024 * 1024 + 40
    })
    await expect(downloader.download('test-model')).resolves.toBeUndefined()
  })

  it('maps a full disk while writing to disk-full', () => {
    const err = classifyDownloadError(Object.assign(new Error('write failed'), { code: 'ENOSPC' }))
    expect(err).toBeInstanceOf(DownloadError)
    expect((err as DownloadError).reason).toBe('disk-full')
  })

  it('passes a cancel through, and never makes it a reason', () => {
    const abort = new DOMException('aborted', 'AbortError')
    expect(classifyDownloadError(abort)).toBe(abort)
  })

  it('never puts a system message in the reason', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED /Users/me/secret'))
    const err = (await new ModelDownloader(tempModelsDir, { fetchImpl })
      .download('test-model')
      .catch((e: unknown) => e)) as Error
    expect(err.message).not.toContain('/Users')
  })
})

describe('resume', () => {
  it('carries on from a stopped download after a failure, not from the start', async () => {
    const failing = createMockFetch({ big: A.subarray(0, 30), proj: B })
    const downloader = new ModelDownloader(tempModelsDir)
    await new ModelDownloader(tempModelsDir, { fetchImpl: failing }).download('test-model').catch(() => {})
    expect(await downloader.downloadedBytes('test-model')).toBe(30)

    const retry = createMockFetch()
    await new ModelDownloader(tempModelsDir, { fetchImpl: retry }).download('test-model')

    expect(new Headers(retry.mock.calls[0]![1].headers).get('Range')).toBe('bytes=30-')
    expect(await downloader.isInstalled('test-model')).toBe(true)
  })

  it('starts over cleanly when the server ignores the Range request', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf.part'), A.subarray(0, 25))
    const ignoring = vi.fn().mockImplementation(async (url: string) =>
      new Response(String(url).endsWith('proj.gguf') ? B : A, { status: 200 })
    )

    await new ModelDownloader(tempModelsDir, { fetchImpl: ignoring }).download('test-model')

    expect((await fs.readFile(join(dir, 'model.gguf'))).equals(A)).toBe(true)
  })

  it('verifies a part file that is already complete without asking the network for it', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf.part'), A)
    const fetchImpl = createMockFetch()

    await new ModelDownloader(tempModelsDir, { fetchImpl }).download('test-model')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('proj.gguf')
  })

  it('discards a part file that is longer than the file should be', async () => {
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf.part'), Buffer.concat([A, A]))
    await new ModelDownloader(tempModelsDir, { fetchImpl: createMockFetch() }).download('test-model')
    expect((await fs.readFile(join(dir, 'model.gguf'))).equals(A)).toBe(true)
  })

  it('reports how much of a model is already on disk', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    expect(await downloader.downloadedBytes('test-model')).toBe(0)
    expect(await downloader.downloadedBytes('nope')).toBe(0)
    const dir = join(tempModelsDir, 'test-model')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'model.gguf'), A)
    await fs.writeFile(join(dir, 'mmproj.gguf.part'), B.subarray(0, 10))
    expect(await downloader.downloadedBytes('test-model')).toBe(70)
  })
})

describe('speed and time left', () => {
  it('measures speed and estimates the time left against the size of both files', async () => {
    let clock = 0
    const fetchImpl = createMockFetch(undefined, 10)
    const downloader = new ModelDownloader(tempModelsDir, {
      fetchImpl,
      now: () => (clock += 100) // every reading is 100 ms after the last
    })
    const seen: DownloadProgress[] = []

    await downloader.download('test-model', { onProgress: (p) => seen.push(p) })

    const downloading = seen.filter((p) => p.phase === 'downloading' && p.receivedBytes > 20 && p.receivedBytes < 100)
    expect(downloading.length).toBeGreaterThan(0)
    for (const p of downloading) {
      expect(p.bytesPerSecond).toBeGreaterThan(0)
      expect(p.secondsLeft).toBe(Math.ceil((100 - p.receivedBytes) / p.bytesPerSecond))
    }
    expect(seen.at(-1)).toMatchObject({ phase: 'done', secondsLeft: 0 })
  })

  it('reports no speed until there is something to measure', async () => {
    const seen: DownloadProgress[] = []
    await new ModelDownloader(tempModelsDir, { fetchImpl: createMockFetch() }).download('test-model', {
      onProgress: (p) => seen.push(p)
    })
    expect(seen[0]).toMatchObject({ bytesPerSecond: 0, secondsLeft: null })
  })
})

describe('deleting, undoing and old folders', () => {
  const install = async (id: string, files = ['model.gguf', 'mmproj.gguf']) => {
    const dir = join(tempModelsDir, id)
    await fs.mkdir(dir, { recursive: true })
    for (const f of files) await fs.writeFile(join(dir, f), 'x')
  }

  it('sets a model aside so it is not installed, and brings it back with Undo', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    await install('test-model')

    expect(await downloader.setAside('test-model')).toBe(true)
    expect(await downloader.isInstalled('test-model')).toBe(false)
    expect(await downloader.listInstalled()).toEqual([])

    expect(await downloader.restoreSetAside('test-model')).toBe(true)
    expect(await downloader.isInstalled('test-model')).toBe(true)
  })

  it('removes set-aside models for good when purged, and then they cannot come back', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    await install('test-model')
    await downloader.setAside('test-model')

    await downloader.purgeSetAside()

    expect(await downloader.restoreSetAside('test-model')).toBe(false)
    expect(await fs.readdir(tempModelsDir)).toEqual([])
  })

  it('has nothing to set aside for a model that is not there', async () => {
    expect(await new ModelDownloader(tempModelsDir).setAside('test-model')).toBe(false)
  })

  it('lists old text-model folders with their size, ignoring catalogue models and set-aside ones', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    await install('qwen2.5-1.5b', ['qwen2.5-1.5b-instruct-q4_k_m.gguf'])
    await install('test-model')
    await install('test-model-nohash')
    await downloader.setAside('test-model-nohash')

    expect(await downloader.listLegacy()).toEqual([{ id: 'qwen2.5-1.5b', sizeBytes: 1 }])
    // An old folder is never counted as an installed model.
    expect(await downloader.listInstalled()).toEqual(['test-model'])
  })

  it('refuses an id that is a path', async () => {
    const downloader = new ModelDownloader(tempModelsDir)
    await expect(downloader.setAside('../outside')).rejects.toThrow()
    await expect(downloader.restoreSetAside('a/b')).rejects.toThrow()
  })
})
