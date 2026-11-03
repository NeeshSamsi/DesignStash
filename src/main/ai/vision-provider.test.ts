import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'
import type { AnalysisInput } from '../../shared/inference'
import {
  VisionInferenceProvider,
  RESULT_JSON_SCHEMA,
  VISION_IMAGE_MAX_EDGE,
  buildRequest,
  parseResult,
  readCoverAsDataUrl,
  type ChatContentPart,
  type ChatRequest
} from './vision-provider'

const VALID = {
  title: 'MacBook on white steps',
  description: 'A laptop mockup on a white staircase.',
  tags: [
    { category: 'Device', label: 'macbook' },
    { category: 'Style', label: 'minimal' },
    { category: 'Angle', label: 'angle' }
  ]
}

const INPUT: AnalysisInput = {
  imagePath: '/library/mockups/1/cover.webp',
  fileName: 'scroll-macbook.psd',
  folderTrail: ['Devices', 'Laptops']
}

const IMAGE = 'data:image/jpeg;base64,AAAA'

function makeProvider(reply: object | string = VALID, image: string | null = IMAGE) {
  const complete = vi.fn<(req: ChatRequest) => Promise<string>>(async () =>
    typeof reply === 'string' ? reply : JSON.stringify(reply)
  )
  const readImage = vi.fn<(path: string) => Promise<string | null>>(async () => image)
  const dispose = vi.fn(async () => {})
  const provider = new VisionInferenceProvider('Qwen 2.5 VL 3B', { complete, readImage, dispose })
  return { provider, complete, readImage, dispose }
}

const userParts = (req: ChatRequest) =>
  req.messages.find((m) => m.role === 'user')!.content as ChatContentPart[]
const userText = (req: ChatRequest) =>
  userParts(req)
    .filter((p): p is Extract<ChatContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')

describe('VisionInferenceProvider.analyze', () => {
  it('reads the cover and returns the parsed suggestion', async () => {
    const { provider, readImage } = makeProvider()
    await expect(provider.analyze(INPUT)).resolves.toEqual(VALID)
    expect(readImage).toHaveBeenCalledWith('/library/mockups/1/cover.webp')
  })

  it('sends the image first, then the file name and folder trail as text', async () => {
    const { provider, complete } = makeProvider()
    await provider.analyze(INPUT)
    const parts = userParts(complete.mock.calls[0]![0])
    expect(parts[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
    expect(parts[1]!.type).toBe('text')
    const text = userText(complete.mock.calls[0]![0])
    expect(text).toContain('File name: scroll-macbook.psd')
    expect(text).toContain('Folders: Devices / Laptops')
    expect(text).toContain('trust the image')
  })

  it('describes from the names alone when there is no cover to read', async () => {
    const { provider, complete } = makeProvider(VALID, null)
    await provider.analyze(INPUT)
    const parts = userParts(complete.mock.calls[0]![0])
    expect(parts.every((p) => p.type === 'text')).toBe(true)
    expect(userText(complete.mock.calls[0]![0])).toContain('no preview image')
  })

  it('carries the first variant into the prompt for the rest of a pile', async () => {
    const { provider, complete } = makeProvider()
    await provider.analyze({
      ...INPUT,
      groupContext: {
        originalTitle: 'MacBook Hero',
        originalDescription: 'Hero section',
        originalTags: [{ category: 'Device', label: 'macbook' }]
      }
    })
    const text = userText(complete.mock.calls[0]![0])
    expect(text).toContain('variant of "MacBook Hero"')
    expect(text).toContain('Device: macbook')
  })

  it('stops its runtime on dispose', async () => {
    const { provider, dispose } = makeProvider()
    await provider.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('exposes id "vision" and the model name', () => {
    const { provider } = makeProvider()
    expect(provider.id).toBe('vision')
    expect(provider.name).toBe('Qwen 2.5 VL 3B')
  })

  it('passes a failed request on to the queue', async () => {
    const provider = new VisionInferenceProvider('m', {
      complete: async () => {
        throw new Error('llama-server answered 500: boom')
      },
      readImage: async () => IMAGE
    })
    await expect(provider.analyze(INPUT)).rejects.toThrow('answered 500')
  })
})

describe('buildRequest', () => {
  it('constrains the reply with the JSON schema, categories limited to the taxonomy', () => {
    const req = buildRequest(INPUT, IMAGE)
    expect(req.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'mockup', schema: RESULT_JSON_SCHEMA }
    })
    const category = RESULT_JSON_SCHEMA.properties.tags.items.properties.category
    expect(category.enum).toEqual([
      'Device',
      'Print & Branding',
      'Apparel',
      'Environment',
      'Style',
      'Angle'
    ])
  })

  it('says what each category covers, without a list of labels to copy', () => {
    const text = userText(buildRequest(INPUT, IMAGE))
    expect(text).toContain('- Device: the screen device the design is shown on')
    expect(text).toContain('- Angle: the camera angle')
    expect(text).not.toContain('windows-laptop')
  })

  it('leaves the folder line out when there are no folders', () => {
    const text = userText(buildRequest({ ...INPUT, folderTrail: [] }, IMAGE))
    expect(text).not.toContain('Folders:')
  })
})

describe('parseResult', () => {
  it('keeps labels as the model wrote them, trimmed, and matches categories regardless of case', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        tags: [
          { category: 'apparel', label: 'Tote Bag' },
          { category: 'ENVIRONMENT', label: ' flat_lay ' }
        ]
      })
    )
    expect(result.tags).toEqual([
      { category: 'Apparel', label: 'Tote Bag' },
      { category: 'Environment', label: 'flat_lay' }
    ])
  })

  it('drops duplicate and empty tags and keeps at most six', () => {
    const tags = [
      { category: 'Device', label: 'macbook' },
      { category: 'Device', label: 'MacBook' },
      { category: 'Style', label: '  ' },
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((label) => ({ category: 'Style', label }))
    ]
    const result = parseResult(JSON.stringify({ ...VALID, tags }))
    expect(result.tags).toHaveLength(6)
    expect(result.tags[0]).toEqual({ category: 'Device', label: 'macbook' })
    expect(result.tags.filter((t) => t.label.toLowerCase() === 'macbook')).toHaveLength(1)
  })

  it('counts labels that differ only in case, spaces or hyphens as one tag', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        tags: [
          { category: 'Device', label: 'Android phone' },
          { category: 'device', label: 'android-phone' },
          { category: 'Device', label: 'ANDROID  PHONE' }
        ]
      })
    )
    expect(result.tags).toEqual([{ category: 'Device', label: 'Android phone' }])
  })

  it('keeps a category the model made up', () => {
    const result = parseResult(
      JSON.stringify({ ...VALID, tags: [{ category: 'Food', label: 'snack' }] })
    )
    expect(result.tags).toEqual([{ category: 'Food', label: 'snack' }])
  })

  it('trims and shortens a long title and description', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        title: `  ${'x'.repeat(80)}  `,
        description: `${'y '.repeat(150)}`
      })
    )
    expect(result.title.length).toBeLessThanOrEqual(60)
    expect(result.title.endsWith('…')).toBe(true)
    expect(result.description.length).toBeLessThanOrEqual(200)
  })

  it('finds the JSON inside surrounding text', () => {
    expect(parseResult(`Sure:\n${JSON.stringify(VALID)}\n`).title).toBe(VALID.title)
  })

  it('throws when there is no JSON, bad JSON, the wrong shape or an empty title', () => {
    expect(() => parseResult('I cannot see an image.')).toThrow('No JSON found')
    expect(() => parseResult('{"title": }')).toThrow('Invalid JSON')
    expect(() => parseResult('{"wrong":"shape"}')).toThrow('schema')
    expect(() => parseResult(JSON.stringify({ ...VALID, title: '   ' }))).toThrow('empty title')
  })
})

describe('readCoverAsDataUrl', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vision-cover-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('scales a WebP cover down and re-encodes it as JPEG', async () => {
    const path = join(dir, 'cover.webp')
    await sharp({ create: { width: 2048, height: 1536, channels: 3, background: '#3366ff' } })
      .webp()
      .toFile(path)

    const url = await readCoverAsDataUrl(path)
    expect(url).toMatch(/^data:image\/jpeg;base64,/)
    const meta = await sharp(Buffer.from(url!.split(',')[1]!, 'base64')).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(VISION_IMAGE_MAX_EDGE)
    expect(meta.height).toBe(768)
  })

  it('leaves a small cover at its size', async () => {
    const path = join(dir, 'small.png')
    await sharp({ create: { width: 300, height: 200, channels: 4, background: '#00000000' } })
      .png()
      .toFile(path)
    const meta = await sharp(
      Buffer.from((await readCoverAsDataUrl(path))!.split(',')[1]!, 'base64')
    ).metadata()
    expect([meta.width, meta.height]).toEqual([300, 200])
  })

  it('returns null for a missing, empty or unreadable cover', async () => {
    const junk = join(dir, 'junk.webp')
    await writeFile(junk, 'not an image')
    await expect(readCoverAsDataUrl(join(dir, 'gone.webp'))).resolves.toBeNull()
    await expect(readCoverAsDataUrl('')).resolves.toBeNull()
    await expect(readCoverAsDataUrl(junk)).resolves.toBeNull()
  })
})
