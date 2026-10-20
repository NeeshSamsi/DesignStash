import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { ModelDownloader } from './download'
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

    await expect(downloader.download('test-model')).rejects.toThrow('Checksum failed')

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
