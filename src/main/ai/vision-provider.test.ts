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
  description: 'A laptop on a white staircase.',
  tags: [
    { category: 'Device', label: 'macbook' },
    { category: 'Style', label: 'minimal' },
    { category: 'Environment', label: 'stairs' }
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
    expect(text).toContain('The image shows what the mockup is')
  })

  it('describes from the names alone when there is no cover to read', async () => {
    const { provider, complete } = makeProvider(VALID, null)
    await provider.analyze(INPUT)
    const parts = userParts(complete.mock.calls[0]![0])
    expect(parts.every((p) => p.type === 'text')).toBe(true)
    expect(userText(complete.mock.calls[0]![0])).toContain('no usable preview image')
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
  it('constrains the reply with the JSON schema: 3 to 6 tags in the seed categories', () => {
    const req = buildRequest(INPUT, IMAGE)
    expect(req.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'mockup', schema: RESULT_JSON_SCHEMA }
    })
    const { tags } = RESULT_JSON_SCHEMA.properties
    expect(tags.items.properties.category.enum).toEqual([
      'Device',
      'Print & Branding',
      'Apparel',
      'Environment',
      'Style',
      'Angle'
    ])
    expect([tags.minItems, tags.maxItems]).toEqual([3, 6])
  })

  it('says what each category covers with a few examples, never the seed list', () => {
    const text = userText(buildRequest(INPUT, IMAGE))
    expect(text).toContain('- Device: screen devices: laptop, MacBook, phone')
    expect(text).toContain('- Apparel: clothing and merchandise: t-shirt, hoodie, cap, tote bag')
    expect(text).toContain('- Angle: front (camera level with the object)')
    expect(text).not.toContain('Windows laptop')
  })

  it('treats printed words as template filler and takes product names from the names', () => {
    const text = userText(buildRequest(INPUT, IMAGE))
    expect(text).toContain('template filler')
    expect(text).toContain('use that product name')
  })

  it('gives its only worked examples from outside the library, so there is nothing to copy', () => {
    const text = userText(buildRequest(INPUT, IMAGE))
    expect(text).toContain('"Red road bike against a garage door"')
    expect(text).not.toMatch(/tote bag on|phone held|coffee cup,/i)
  })

  it('asks for the setting to be left out when there is no image to see it in', () => {
    expect(userText(buildRequest(INPUT, null))).toContain("can't see the setting, so leave it out")
  })

  it('keeps the title and description to plain characters, so no other script leaks in', () => {
    const { title, description } = RESULT_JSON_SCHEMA.properties
    for (const field of [title, description]) {
      const plain = new RegExp(field.pattern)
      expect(plain.test("Road bike, a cyclist's 3D render")).toBe(true)
      expect(plain.test('A white brick 墙')).toBe(false)
      expect(plain.test('Text "quoted"')).toBe(false)
    }
  })

  it('sends Qwen its own repeat penalty and caps the reply', () => {
    const req = buildRequest(INPUT, IMAGE)
    expect([req.temperature, req.repeat_penalty, req.max_tokens]).toEqual([0.2, 1.05, 450])
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

  it('never suggests an Angle tag, although the model is asked for one', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        tags: [
          { category: 'Device', label: 'MacBook' },
          { category: 'angle', label: 'Side' }
        ]
      })
    )
    expect(result.tags).toEqual([{ category: 'Device', label: 'MacBook' }])
  })

  it('takes free, mockup, PSD and stock-site names out of the title and tags, dropping a tag left empty', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        title: 'Free Cap Mockup - Royal Blue Baseball Cap',
        tags: [
          { category: 'Apparel', label: 'Cap' },
          { category: 'Print & Branding', label: 'mockup' },
          { category: 'Style', label: 'Pixeden PSD template' }
        ]
      })
    )
    expect(result.title).toBe('Cap - Royal Blue Baseball Cap')
    expect(result.tags).toEqual([{ category: 'Apparel', label: 'Cap' }])
  })

  it('cuts printed text the model quotes, with the words around it, from the description and title', () => {
    const result = parseResult(
      JSON.stringify({
        ...VALID,
        title: "Beige tote bag with 'totebag mckp' text",
        description:
          "A white snack bar package labeled 'SNACKBAR' with the number '1' in orange, on a grey surface. A sleek phone with a large '15' in bright yellow."
      })
    )
    expect(result.title).toBe('Beige tote bag')
    expect(result.description).toBe('A white snack bar package, on a grey surface. A sleek phone.')
  })

  it("leaves apostrophes in words alone", () => {
    const result = parseResult(
      JSON.stringify({ ...VALID, description: "A designer's desk with a cyclist's cap and the bike's bell." })
    )
    expect(result.description).toBe("A designer's desk with a cyclist's cap and the bike's bell.")
  })

  it('takes mockup out of the description without leaving a hole', () => {
    const say = (description: string) => parseResult(JSON.stringify({ ...VALID, description })).description
    expect(say('A clay mockup of an Apple Watch Ultra on grey.')).toBe('A clay Apple Watch Ultra on grey.')
    expect(say('A mockup of a paperback book on a mirror.')).toBe('A paperback book on a mirror.')
    expect(say('A canvas tote bag mockup on the floor.')).toBe('A canvas tote bag on the floor.')
    expect(say('A laptop displaying a mockup template.')).toBe('A laptop displaying a design template.')
  })

  it('keeps names like iPhone as written when it capitalises the start', () => {
    const result = parseResult(JSON.stringify({ ...VALID, title: 'iPhone 15 Mockup on black' }))
    expect(result.title).toBe('iPhone 15 on black')
  })

  it('drops a sentence that only reports the printed text', () => {
    const description =
      "A black round sticker with a green smiley face. The text around the sticker reads 'STICKER MOCKUP' and 'DOWNLOAD'. It sits on light grey."
    expect(parseResult(JSON.stringify({ ...VALID, description })).description).toBe(
      'A black round sticker with a green smiley face. It sits on light grey.'
    )
  })

  it('reads "a vibrant mockup featuring" as a design, and drops "free" before the object', () => {
    const say = (description: string) => parseResult(JSON.stringify({ ...VALID, description })).description
    expect(say('A vibrant mockup featuring notebooks and business cards.')).toBe(
      'A vibrant design featuring notebooks and business cards.'
    )
    expect(say('A free paper postal package on a desk.')).toBe('A paper postal package on a desk.')
  })

  it('shortens a long title at a word, not mid-word', () => {
    const title = 'Natural canvas tote bag with long handles standing in warmest light'
    const result = parseResult(JSON.stringify({ ...VALID, title }))
    expect(result.title).toBe('Natural canvas tote bag with long handles standing in…')
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

/** A cover with real content: random noise, the opposite of a blank placeholder. */
function noise(width: number, height: number, channels: 3 | 4 = 3) {
  const data = Buffer.alloc(width * height * channels)
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24
  return sharp(data, { raw: { width, height, channels } })
}

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
    await sharp(await noise(256, 192).png().toBuffer()).resize(2048, 1536).webp().toFile(path)

    const url = await readCoverAsDataUrl(path)
    expect(url).toMatch(/^data:image\/jpeg;base64,/)
    const meta = await sharp(Buffer.from(url!.split(',')[1]!, 'base64')).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(VISION_IMAGE_MAX_EDGE)
    expect(meta.height).toBe(768)
  }, 20_000)

  it('leaves a small cover at its size', async () => {
    const path = join(dir, 'small.png')
    await noise(300, 200, 4).png().toFile(path)
    const meta = await sharp(
      Buffer.from((await readCoverAsDataUrl(path))!.split(',')[1]!, 'base64')
    ).metadata()
    expect([meta.width, meta.height]).toEqual([300, 200])
  })

  it('returns null for a near-blank placeholder preview, so the mockup is described from its names', async () => {
    const path = join(dir, 'placeholder.png')
    const notice = Buffer.from(
      '<svg width="800" height="600"><rect width="800" height="600" fill="#fff"/><rect x="280" y="270" width="240" height="60" fill="none" stroke="#222" stroke-width="2"/><text x="300" y="305" font-size="18">Remove this layer to start</text></svg>'
    )
    await sharp(notice).png().toFile(path)
    await expect(readCoverAsDataUrl(path)).resolves.toBeNull()
  }, 20_000)

  it('returns null for a missing, empty or unreadable cover', async () => {
    const junk = join(dir, 'junk.webp')
    await writeFile(junk, 'not an image')
    await expect(readCoverAsDataUrl(join(dir, 'gone.webp'))).resolves.toBeNull()
    await expect(readCoverAsDataUrl('')).resolves.toBeNull()
    await expect(readCoverAsDataUrl(junk)).resolves.toBeNull()
  })
})
