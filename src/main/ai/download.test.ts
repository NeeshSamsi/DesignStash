import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { ModelDownloader } from './download'
import * as registry from './registry'
import type { ModelTier } from './hardware'

// Mock registry
const mockModel = {
  id: 'test-model',
  name: 'Test Model',
  tier: 'small' as ModelTier,
  sizeBytes: 100,
  url: 'http://test.com/model.gguf',
  sha256: createHash('sha256').update(Buffer.from(''.padStart(100, 'a'))).digest('hex')
}
const mockModelNoSha = {
  id: 'test-model-nohash',
  name: 'Test Model No Hash',
  tier: 'small' as ModelTier,
  sizeBytes: 100,
  url: 'http://test.com/model-nohash.gguf',
  sha256: null
}

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

function createMockFetch(data: Buffer, options: { chunkSize?: number; headers?: Record<string, string> } = {}) {
  const { chunkSize = 10, headers = {} } = options
  
  return vi.fn().mockImplementation(async (url: string, opts: RequestInit = {}) => {
    let streamData = data
    if (opts.headers) {
      const h = new Headers(opts.headers)
      if (h.has('Range')) {
        const range = h.get('Range')!
        const [start] = range.replace('bytes=', '').split('-').map(Number)
        streamData = data.slice(start)
      }
    }

    const stream = new Readable({
      read() {
        for (let i = 0; i < streamData.length; i += chunkSize) {
          this.push(streamData.slice(i, i + chunkSize))
        }
        this.push(null)
      }
    })

    const isRangeRequest = opts.headers && new Headers(opts.headers).has('Range')
    return Promise.resolve(new Response(stream as unknown as ReadableStream, {
      status: isRangeRequest ? 206 : 200,
      headers: { 'content-length': String(streamData.length), ...headers },
    }))
  })
}


describe('ModelDownloader', () => {
  it('should download a model successfully and emit progress events', async () => {
    const modelData = Buffer.from(''.padStart(100, 'a'))
    const fetchImpl = createMockFetch(modelData)
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })
    const onProgress = vi.fn()

    await downloader.download('test-model', { onProgress })

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'downloading' }))
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'verifying' }))
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done', receivedBytes: 100, totalBytes: 100 }))

    const installed = await downloader.isInstalled('test-model')
    expect(installed).toBe(true)
  })

  it('should fail if checksum is incorrect', async () => {
    const modelData = Buffer.from(''.padStart(100, 'x')) // wrong data
    const fetchImpl = createMockFetch(modelData)
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })

    await expect(downloader.download('test-model')).rejects.toThrow('Checksum failed')

    const partPath = join(tempModelsDir, 'test-model', 'model.gguf.part')
    await expect(fs.stat(partPath)).rejects.toThrow() // check cleanup
  })

  it('should be able to cancel a download', async () => {
    const modelData = Buffer.from(''.padStart(100, 'a'))
    const fetchImpl = createMockFetch(modelData)
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })
    const controller = new AbortController()

    const downloadPromise = downloader.download('test-model', { signal: controller.signal })
    controller.abort()

    await expect(downloadPromise).rejects.toHaveProperty('name', 'AbortError')
  })

  it('should resume a partial download', async () => {
    const modelData = Buffer.from(''.padStart(100, 'a'))
    const partialData = modelData.slice(0, 50)
    
    await fs.mkdir(join(tempModelsDir, 'test-model'))
    await fs.writeFile(join(tempModelsDir, 'test-model', 'model.gguf.part'), partialData)

    const fetchImpl = createMockFetch(modelData)
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })
    
    await downloader.download('test-model')
    
    expect(fetchImpl).toHaveBeenCalled()
    const firstCall = fetchImpl.mock.calls[0]
    expect(firstCall).toBeDefined()
    if (!firstCall || !firstCall[1]) throw new Error('Fetch not called correctly')
    const callHeaders = new Headers(firstCall[1].headers)
    expect(callHeaders.get('Range')).toBe('bytes=50-')
  })

  it('should correctly list, check for, and delete installed models', async () => {
    const downloader = new ModelDownloader(tempModelsDir)

    // Initially nothing is installed
    expect(await downloader.isInstalled('test-model')).toBe(false)
    expect(await downloader.listInstalled()).toEqual([])

    // "Install" a model
    const modelDir = join(tempModelsDir, 'test-model')
    await fs.mkdir(modelDir, { recursive: true })
    await fs.writeFile(join(modelDir, 'model.gguf'), '')
    
    expect(await downloader.isInstalled('test-model')).toBe(true)
    expect(await downloader.listInstalled()).toEqual(['test-model'])

    // Delete it
    await downloader.deleteModel('test-model')
    expect(await downloader.isInstalled('test-model')).toBe(false)
    expect(await downloader.listInstalled()).toEqual([])
    await expect(fs.stat(modelDir)).rejects.toThrow()
  })

  it('should skip integrity check and still succeed when sha256 is null', async () => {
    const modelData = Buffer.from(''.padStart(100, 'a'))
    const fetchImpl = createMockFetch(modelData)
    const downloader = new ModelDownloader(tempModelsDir, { fetchImpl })

    await downloader.download('test-model-nohash')

    expect(await downloader.isInstalled('test-model-nohash')).toBe(true)
    const modelPath = join(tempModelsDir, 'test-model-nohash', 'model-nohash.gguf')
    expect((await fs.stat(modelPath)).size).toBe(100)
  })
})
