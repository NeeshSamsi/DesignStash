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
  type ChatReply,
  type ChatRequest
} from './vision-provider'
import { SCENE_THINGS } from './scene-check'
import type { PromptProfile } from './prompts'

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
const SHIPPED: PromptProfile = { buildRequest, parseResult }

function makeProvider(reply: object | string = VALID, image: string | null = IMAGE) {
  const complete = vi.fn<(req: ChatRequest) => Promise<ChatReply>>(async () => ({
    text: typeof reply === 'string' ? reply : JSON.stringify(reply)
  }))
  const readImage = vi.fn<(path: string) => Promise<string | null>>(async () => image)
  const dispose = vi.fn(async () => {})
  const provider = new VisionInferenceProvider('Qwen 2.5 VL 3B', {
    prompt: SHIPPED,
    complete,
    readImage,
    dispose
  })
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

  it("asks with the model's own prompt profile and reads the reply with it", async () => {
    const request = { ...buildRequest(INPUT, IMAGE), temperature: 0.7, top_k: 20 }
    const prompt: PromptProfile = {
      buildRequest: vi.fn(() => request),
      parseResult: vi.fn(() => ({ title: 'From the profile', description: 'd', tags: [] }))
    }
    const complete = vi.fn(async () => ({ text: 'raw reply' }))
    const provider = new VisionInferenceProvider('m', {
      prompt,
      complete,
      readImage: async () => IMAGE
    })
    await expect(provider.analyze(INPUT)).resolves.toMatchObject({ title: 'From the profile' })
    expect(prompt.buildRequest).toHaveBeenCalledWith(INPUT, IMAGE)
    expect(complete).toHaveBeenCalledWith(request)
    expect(prompt.parseResult).toHaveBeenCalledWith('raw reply')
  })

  it('stops its runtime on dispose', async () => {
    const { provider, dispose } = makeProvider()
    await provider.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("takes the object's colours out of every answer and leaves the setting's (round 4)", async () => {
    const coloured = {
      title: 'White mug on a grey table',
      description: 'A white mug with a black handle on a grey table.',
      tags: [
        { category: 'Print & Branding', label: 'white mug' },
        { category: 'Environment', label: 'table' }
      ]
    }
    const clean = {
      title: 'Mug on a grey table',
      description: 'A mug with a handle on a grey table.',
      tags: [
        { category: 'Print & Branding', label: 'mug' },
        { category: 'Environment', label: 'table' }
      ]
    }
    expect(await makeProvider(coloured).provider.analyze(INPUT)).toEqual(clean)
    expect(await makeProvider(coloured, null).provider.analyze(INPUT)).toEqual(clean)
  })

  it('stops its runtime on stop(), for a run that hit the hard stop', async () => {
    const { provider, dispose } = makeProvider()
    await provider.stop()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("names a pile's variations in one request when its profile asks (the 4B, the 9B), and has no way to otherwise", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vision-pile-'))
    const covers = await Promise.all(
      ['front', 'side'].map(async (name) => {
        const path = join(dir, `${name}.png`)
        await sharp({ create: { width: 400, height: 300, channels: 3, background: '#808080' } }).png().toFile(path)
        return path
      })
    )
    const complete = vi.fn<(req: ChatRequest) => Promise<ChatReply>>(async () => ({ text: JSON.stringify({ variations: ['front view', 'same'] }) }))
    const provider = new VisionInferenceProvider('m', { prompt: { ...SHIPPED, variations: true }, complete, readImage: async () => IMAGE })
    const pile = covers.map((coverPath, i) => ({ coverPath, fileName: `phone_${i}.psd` }))

    expect(await provider.pileVariations!(pile)).toEqual(['front view', null])
    expect(complete).toHaveBeenCalledOnce()
    expect(userText(complete.mock.calls[0]![0])).toContain('1 = phone_0.psd, 2 = phone_1.psd')
    expect(makeProvider().provider.pileVariations).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })

  it("says whether its runtime has the model loaded, and loads it on load()", async () => {
    let ready = false
    const load = vi.fn(async () => {
      ready = true
    })
    const provider = new VisionInferenceProvider('m', { prompt: SHIPPED, complete: async () => ({ text: '' }), readImage: async () => null, loaded: () => ready, load })
    expect(provider.loaded).toBe(false)
    await provider.load()
    expect([provider.loaded, load.mock.calls.length]).toEqual([true, 1])
    // A runtime that can't say is taken as loaded.
    expect(makeProvider().provider.loaded).toBe(true)
    await expect(makeProvider().provider.load()).resolves.toBeUndefined()
  })

  it('exposes id "vision" and the model name', () => {
    const { provider } = makeProvider()
    expect(provider.id).toBe('vision')
    expect(provider.name).toBe('Qwen 2.5 VL 3B')
  })

  it('passes a failed request on to the queue', async () => {
    const provider = new VisionInferenceProvider('m', {
      prompt: SHIPPED,
      complete: async () => {
        throw new Error('llama-server answered 500: boom')
      },
      readImage: async () => IMAGE
    })
    await expect(provider.analyze(INPUT)).rejects.toThrow('answered 500')
  })
})

describe('VisionInferenceProvider scene-thing check', () => {
  const DESK = {
    title: 'iMac on a wooden desk',
    description: 'An iMac, also called a desktop computer, on a wooden desk beside a plant.',
    tags: [
      { category: 'Device', label: 'iMac' },
      { category: 'Environment', label: 'desk' },
      { category: 'Environment', label: 'plant' }
    ]
  }
  const CHECKED: PromptProfile = { ...SHIPPED, sceneThings: SCENE_THINGS }
  const answerToken = (yes: number, no: number) => ({
    content: [
      {
        top_logprobs: [
          { token: 'yes', logprob: Math.log(yes) },
          { token: 'no', logprob: Math.log(no) }
        ]
      }
    ]
  })

  /** The answer first, then each check's P(yes) for the thing its question names. */
  function checked(pYes: Record<string, number | Error>, prompt: PromptProfile = CHECKED, image: string | null = IMAGE) {
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      const text = JSON.stringify(req)
      const thing = /Is there an? ([a-z]+) in this image/.exec(text)?.[1]
      if (!thing) return { text: JSON.stringify(DESK) }
      const p = pYes[thing]!
      if (p instanceof Error) throw p
      return { text: p >= 0.5 ? 'yes' : 'no', logprobs: answerToken(p, 1 - p) }
    })
    const provider = new VisionInferenceProvider('m', { prompt, complete, readImage: async () => image })
    return { provider, complete }
  }

  it('takes out a thing the image says no to, and keeps one it says yes to', async () => {
    const { provider } = checked({ desk: 0.01, plant: 0.9 })
    await expect(provider.analyze(INPUT)).resolves.toEqual({
      title: 'iMac',
      description: 'An iMac, also called a desktop computer beside a plant.',
      tags: [
        { category: 'Device', label: 'iMac' },
        { category: 'Environment', label: 'plant' }
      ]
    })
  })

  it('takes a thing out under P(yes) 0.2 only', async () => {
    const { provider } = checked({ desk: 0.2, plant: 0.19 })
    const result = await provider.analyze(INPUT)
    expect(result.tags.map((t) => t.label)).toEqual(['iMac', 'desk'])
  })

  it('asks one greedy one-token yes/no question per thing, on the same image, with logprobs', async () => {
    const { provider, complete } = checked({ desk: 0.9, plant: 0.9 })
    await provider.analyze(INPUT)
    expect(complete).toHaveBeenCalledTimes(3)
    const question = complete.mock.calls[1]![0] as ChatRequest & Record<string, unknown>
    expect(question).toMatchObject({
      grammar: 'root ::= "yes" | "no"',
      temperature: 0,
      max_tokens: 1,
      logprobs: true,
      top_logprobs: 5
    })
    expect(question).not.toHaveProperty('response_format')
    expect(question.messages[0]).toEqual(buildRequest(INPUT, IMAGE).messages[0])
    expect(question.messages[1]!.content).toEqual([
      { type: 'image_url', image_url: { url: IMAGE } },
      { type: 'text', text: 'Look only at the image. Is there a desk in this image? Answer yes or no.' }
    ])
  })

  it('checks nothing when there is no image to look at', async () => {
    const { provider, complete } = checked({}, CHECKED, null)
    await expect(provider.analyze(INPUT)).resolves.toMatchObject({ title: 'iMac on a wooden desk' })
    expect(complete).toHaveBeenCalledOnce()
  })

  it('checks nothing for a profile without scene things', async () => {
    const { provider, complete } = checked({}, SHIPPED)
    await provider.analyze(INPUT)
    expect(complete).toHaveBeenCalledOnce()
  })

  it('keeps a thing whose check fails or gives no reading', async () => {
    const { provider } = checked({ desk: new Error('answered 500'), plant: Number.NaN })
    const result = await provider.analyze(INPUT)
    expect(result.tags.map((t) => t.label)).toEqual(['iMac', 'desk', 'plant'])
  })
})

describe('VisionInferenceProvider with a masked design slot', () => {
  const MASKED = 'data:image/jpeg;base64,MASKED'
  const LAMP = {
    title: 'Stacked white cube lamp',
    description: 'A white cube lamp with three stacked sections on a dark base.',
    tags: [{ category: 'Environment', label: 'lamp' }]
  }
  const BOXES = {
    title: 'Three stacked boxes',
    description: 'Three stacked boxes on a dark base.',
    tags: [{ category: 'Print & Branding', label: 'box' }]
  }

  /** Answers LAMP first and BOXES when asked again; the check says no to a lamp. */
  function masked(profile: Partial<PromptProfile>, redoFails = false, maskPath: string | null = '/library/mockups/1/cover-ai-outline.png') {
    const answers: object[] = []
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      const text = JSON.stringify(req)
      if (/Is there a lamp in this image/.test(text)) return { text: 'no', logprobs: { content: [{ top_logprobs: [{ token: 'no', logprob: 0 }] }] } }
      if (/there is no lamp in it/.test(text)) {
        if (redoFails) throw new Error('answered 500')
        answers.push(BOXES)
        return { text: JSON.stringify(BOXES) }
      }
      answers.push(LAMP)
      return { text: JSON.stringify(LAMP) }
    })
    const readImage = vi.fn(async (path: string) => (path.includes('cover-ai') ? MASKED : IMAGE))
    const maskedCover = vi.fn(async () => maskPath)
    const provider = new VisionInferenceProvider('m', {
      prompt: { ...SHIPPED, sceneThings: SCENE_THINGS, mask: 'outline', ...profile },
      complete,
      readImage,
      maskedCover
    })
    return { provider, complete, readImage, maskedCover }
  }

  it("answers from the cover with the slot painted over, in the profile's fill", async () => {
    const { provider, complete, maskedCover } = masked({})
    await provider.analyze(INPUT)
    expect(maskedCover).toHaveBeenCalledWith(INPUT.imagePath, 'outline')
    expect(userParts(complete.mock.calls[0]![0] as ChatRequest)[0]).toEqual({ type: 'image_url', image_url: { url: MASKED } })
  })

  it('tells the prompt the slot is painted over, and only when it is', async () => {
    const buildRequest = vi.fn(SHIPPED.buildRequest)
    const { provider } = masked({ buildRequest })
    await provider.analyze(INPUT)
    expect(buildRequest.mock.calls[0]![0]).toEqual({ ...INPUT, slotMasked: true })
    const unmasked = masked({ buildRequest }, false, null)
    buildRequest.mockClear()
    await unmasked.provider.analyze(INPUT)
    expect(buildRequest.mock.calls[0]![0]).toEqual(INPUT)
  })

  it('with an object hint, names the object from the cover as it is and tells the masked request', async () => {
    const calls: object[] = []
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      calls.push(req)
      const text = JSON.stringify(req)
      if (/What kind of object is this mockup of/.test(text)) return { text: JSON.stringify({ object: 'boxes' }) }
      return { text: JSON.stringify(BOXES) }
    })
    const readImage = vi.fn(async (path: string) => (path.includes('cover-ai') ? MASKED : IMAGE))
    const provider = new VisionInferenceProvider('m', {
      prompt: { ...SHIPPED, mask: 'label', objectHint: true },
      complete,
      readImage,
      maskedCover: async () => '/library/mockups/1/cover-ai-label.png'
    })
    await expect(provider.analyze(INPUT)).resolves.toEqual(BOXES)
    const hint = calls[0] as ChatRequest
    expect(userParts(hint)[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
    expect(userText(hint)).not.toContain(INPUT.fileName)
    const answer = calls[1] as ChatRequest
    expect(userParts(answer)[0]).toEqual({ type: 'image_url', image_url: { url: MASKED } })
    expect(userText(answer)).toContain('Seen in full, the main object is: boxes. Use that name for it.')
  })

  it('answers without a hint when naming the object fails, and asks none without a mask', async () => {
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      if (/What kind of object/.test(JSON.stringify(req))) throw new Error('answered 500')
      return { text: JSON.stringify(BOXES) }
    })
    const provider = (mask: string | null) =>
      new VisionInferenceProvider('m', {
        prompt: { ...SHIPPED, mask: 'label', objectHint: true },
        complete,
        readImage: async () => IMAGE,
        maskedCover: async () => mask
      })
    await expect(provider('/m/cover-ai-label.png').analyze(INPUT)).resolves.toEqual(BOXES)
    expect(userText(complete.mock.calls[1]![0] as ChatRequest)).not.toContain('Seen in full')
    complete.mockClear()
    await provider(null).analyze(INPUT)
    expect(complete).toHaveBeenCalledOnce()
  })

  it('asks the scene check about the cover as it is', async () => {
    const { provider, complete } = masked({})
    await provider.analyze(INPUT)
    const question = complete.mock.calls[1]![0] as ChatRequest
    expect(userParts(question)[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
  })

  describe('with checkEdge (the 4B, round 4)', () => {
    /** A real cover, 1200 by 900, so it can be scaled. */
    const bigCover = async () =>
      `data:image/png;base64,${(await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#808080' } }).png().toBuffer()).toString('base64')}`
    const size = async (url: string) => sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')).metadata()
    const imageOf = (req: ChatRequest) => (userParts(req).find((p) => p.type === 'image_url') as { image_url: { url: string } }).image_url.url

    function scaled(cover: string, maskPath: string | null) {
      const complete = vi.fn(async (req: object): Promise<ChatReply> => {
        const text = JSON.stringify(req)
        if (/Is there a lamp in this image/.test(text)) return { text: 'yes', logprobs: { content: [{ top_logprobs: [{ token: 'yes', logprob: 0 }] }] } }
        if (/What kind of object/.test(text)) return { text: JSON.stringify({ object: 'lamp' }) }
        return { text: JSON.stringify(LAMP) }
      })
      const provider = new VisionInferenceProvider('m', {
        prompt: { ...SHIPPED, sceneThings: SCENE_THINGS, mask: 'outline', objectHint: true, checkEdge: 512 },
        complete,
        readImage: vi.fn(async (path: string) => (path.includes('cover-ai') ? MASKED : cover)),
        maskedCover: vi.fn(async () => maskPath)
      })
      return { provider, complete }
    }

    it('asks the scene check about the cover as it is, scaled to fit, and names the object from it at full size', async () => {
      const cover = await bigCover()
      const { provider, complete } = scaled(cover, '/library/mockups/1/cover-ai-outline.png')
      await provider.analyze(INPUT)
      const [hint, answer, check] = complete.mock.calls.map((c) => c[0] as ChatRequest)
      expect(imageOf(hint!)).toBe(cover)
      expect(imageOf(answer!)).toBe(MASKED)
      expect(await size(imageOf(check!))).toMatchObject({ width: 512, height: 384, format: 'jpeg' })
    })

    it("scales the check without a slot mask too, where it looks at the answer's own image", async () => {
      const cover = await bigCover()
      const { provider, complete } = scaled(cover, null)
      await provider.analyze(INPUT)
      const [answer, check] = complete.mock.calls.map((c) => c[0] as ChatRequest)
      expect(imageOf(answer!)).toBe(cover)
      expect(await size(imageOf(check!))).toMatchObject({ width: 512, height: 384 })
    })
  })

  it("shows the profile's fallback fill when the masked cover is too blank to show", async () => {
    const SOFT = 'data:image/jpeg;base64,SOFT'
    const buildRequest = vi.fn(SHIPPED.buildRequest)
    const complete = vi.fn<(req: object) => Promise<ChatReply>>(async () => ({ text: JSON.stringify(BOXES) }))
    const readImage = vi.fn(async (path: string) => (path.includes('label') ? null : path.includes('soft') ? SOFT : IMAGE))
    const provider = (blankFallback?: 'soft') =>
      new VisionInferenceProvider('m', {
        prompt: { ...SHIPPED, buildRequest, mask: 'label', ...(blankFallback && { blankFallback }) },
        complete,
        readImage,
        maskedCover: async (_path, fill) => `/m/cover-ai-${fill}.png`
      })
    await provider('soft').analyze(INPUT)
    expect(userParts(complete.mock.calls[0]![0] as ChatRequest)[0]).toEqual({ type: 'image_url', image_url: { url: SOFT } })
    expect(buildRequest.mock.calls[0]![0]).toEqual({ ...INPUT, slotMasked: true })
    complete.mockClear()
    buildRequest.mockClear()
    await provider().analyze(INPUT)
    expect(userParts(complete.mock.calls[0]![0] as ChatRequest).some((p) => p.type === 'image_url')).toBe(false)
    expect(buildRequest.mock.calls[0]![0]).toEqual(INPUT)
  })

  it('answers from the cover as it is when the mockup has no slot mask', async () => {
    const { provider, complete } = masked({}, false, null)
    await provider.analyze(INPUT)
    expect(userParts(complete.mock.calls[0]![0] as ChatRequest)[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
  })

  it('without redo, takes the refused thing out of the first answer', async () => {
    const { provider, complete } = masked({})
    const result = await provider.analyze(INPUT)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(result.tags).toEqual([])
  })

  it('with redo, asks again once, told the image has none of the refused things', async () => {
    const { provider, complete } = masked({ redo: true })
    await expect(provider.analyze(INPUT)).resolves.toEqual(BOXES)
    expect(complete).toHaveBeenCalledTimes(3)
    const again = complete.mock.calls[2]![0] as ChatRequest
    expect(userParts(again)[0]).toEqual({ type: 'image_url', image_url: { url: MASKED } })
    expect(userText(again)).toContain('Checked against the image: there is no lamp in it.')
  })

  it('keeps the first answer, less the refused thing, when asking again fails', async () => {
    const { provider } = masked({ redo: true }, true)
    const result = await provider.analyze(INPUT)
    // Less its colour too, which is taken out last.
    expect(result.title).toBe('Stacked cube lamp')
    expect(result.tags).toEqual([])
  })
})

describe('VisionInferenceProvider placeholder check (verify)', () => {
  const SOFT = 'data:image/jpeg;base64,SOFT'
  const LABEL = 'data:image/jpeg;base64,LABEL'
  const GRID = { title: 'Blue grid MacBook on white bench', description: 'A MacBook with a blue grid screen on a white bench.', tags: [] }
  const CLEAN = { title: 'Long scroll MacBook on white bench', description: 'A MacBook on a white bench.', tags: [] }
  /** GRID as it comes out: the object's colour is taken out last, after the check. */
  const GRID_KEPT = { ...GRID, title: 'Grid MacBook on white bench' }

  function verifying(says: Record<string, 'yes' | 'no'>, masks = true) {
    const calls: object[] = []
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      calls.push(req)
      const text = JSON.stringify(req)
      const word = /Is anything in this image ([a-z]+) in colour|Is there an? ([a-z]+) in this image/.exec(text)
      if (word) {
        const yes = says[word[1] ?? word[2]!] === 'yes'
        return { text: yes ? 'yes' : 'no', logprobs: { content: [{ top_logprobs: [{ token: yes ? 'yes' : 'no', logprob: 0 }] }] } }
      }
      return { text: JSON.stringify(text.includes(LABEL) ? CLEAN : GRID) }
    })
    const provider = new VisionInferenceProvider('m', {
      prompt: { ...SHIPPED, verify: { check: 'soft', remask: 'label' } },
      complete,
      readImage: async (path) => (path.includes('soft') ? SOFT : path.includes('label') ? LABEL : IMAGE),
      maskedCover: async (_path, fill) => (masks ? `/m/cover-ai-${fill}.png` : null)
    })
    return { provider, calls }
  }

  it("takes the object's colours out only after the check, which still asks about them", async () => {
    const { provider, calls } = verifying({ blue: 'yes', grid: 'yes' })
    const result = await provider.analyze(INPUT)
    expect(calls.some((c) => JSON.stringify(c).includes('blue in colour'))).toBe(true)
    expect(result.title).toBe('Grid MacBook on white bench')
  })

  it('answers from the cover as it is, and keeps the answer when every word is also outside the slot', async () => {
    const { provider, calls } = verifying({ blue: 'yes', grid: 'yes' })
    await expect(provider.analyze(INPUT)).resolves.toEqual(GRID_KEPT)
    expect(userParts(calls[0] as ChatRequest)[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
    expect(userParts(calls[1] as ChatRequest)).toEqual([
      { type: 'image_url', image_url: { url: SOFT } },
      { type: 'text', text: 'Look only at the image. Is anything in this image blue in colour? Answer yes or no.' }
    ])
    expect(calls).toHaveLength(3)
  })

  it('answers again from the labelled cover, given the first answer less those words, when a word is only on the slot', async () => {
    const { provider, calls } = verifying({ blue: 'no', grid: 'yes' })
    await expect(provider.analyze(INPUT)).resolves.toEqual(CLEAN)
    const again = calls[3] as ChatRequest
    expect(userParts(again)[0]).toEqual({ type: 'image_url', image_url: { url: LABEL } })
    expect(userText(again)).toContain(
      "A first draft, written from the cover before its design area was blanked out, with the stand-in design's words taken out:\n" +
        'Title: grid MacBook on white bench\nDescription: A MacBook with a grid screen on a white bench.\nTags: \n' +
        'Keep its names, other names and details where the image agrees, mend any sentence the cuts left broken, and never describe the design area.'
    )
  })

  it("answers again from the profile's fallback fill when the labelled cover is too blank to show, or keeps the answer without one", async () => {
    const calls: object[] = []
    const complete = vi.fn(async (req: object): Promise<ChatReply> => {
      calls.push(req)
      if (/Is anything in this image blue/.test(JSON.stringify(req))) return { text: 'no', logprobs: { content: [{ top_logprobs: [{ token: 'no', logprob: 0 }] }] } }
      return { text: JSON.stringify(calls.length > 1 ? CLEAN : GRID) }
    })
    const provider = (blankFallback?: 'soft') =>
      new VisionInferenceProvider('m', {
        prompt: { ...SHIPPED, verify: { check: 'soft', remask: 'label' }, ...(blankFallback && { blankFallback }) },
        complete,
        readImage: async (path) => (path.includes('soft') ? SOFT : path.includes('label') ? null : IMAGE),
        maskedCover: async (_path, fill) => `/m/cover-ai-${fill}.png`
      })
    await expect(provider('soft').analyze(INPUT)).resolves.toEqual(CLEAN)
    expect(userParts(calls[3] as ChatRequest)[0]).toEqual({ type: 'image_url', image_url: { url: SOFT } })
    calls.length = 0
    await expect(provider().analyze(INPUT)).resolves.toEqual(GRID_KEPT)
    expect(calls).toHaveLength(3)
  })

  it('checks nothing for a mockup without a slot mask', async () => {
    const { provider, calls } = verifying({}, false)
    await expect(provider.analyze(INPUT)).resolves.toEqual(GRID_KEPT)
    expect(calls).toHaveLength(1)
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

describe('VisionInferenceProvider pile edits', () => {
  const EDIT = {
    before: { description: 'A laptop on a stack of white books.', tags: ['Laptop', 'books'] },
    after: { description: 'A laptop on a white slatted bench.', tags: ['Laptop', 'bench'] }
  }
  const ENTRY = { description: 'A laptop on a grey mesh floor.', tags: ['Laptop', 'floor'] }

  function pileProvider(pileEdits: PromptProfile['pileEdits'], reply: object) {
    const complete = vi.fn<(req: ChatRequest) => Promise<ChatReply>>(async () => ({ text: JSON.stringify(reply) }))
    const readImage = vi.fn<(path: string) => Promise<string | null>>(async () => IMAGE)
    const provider = new VisionInferenceProvider('Qwen3.5 9B', { prompt: { ...SHIPPED, ...(pileEdits && { pileEdits }) }, complete, readImage })
    return { provider, complete, readImage }
  }

  it('judges pile edits only when its profile says so, and rewrites unless told to copy', () => {
    expect(pileProvider({ judge: true }, {}).provider.pileEdits?.check).toBeTypeOf('function')
    expect(pileProvider(undefined, {}).provider.pileEdits?.check).toBeUndefined()
    expect(pileProvider(undefined, {}).provider.pileEdits?.rewrite).toBeTypeOf('function')
    expect(pileProvider({ copy: true }, {}).provider.pileEdits?.rewrite).toBeUndefined()
  })

  it('asks the cover as it is whether what the edit added is true of it, greedy, and reads the reason on a no', async () => {
    const { provider, complete, readImage } = pileProvider({ judge: true }, { answer: 'no', reason: 'This one is on a mesh floor.' })
    const said = await provider.pileEdits!.check!('/lib/side.webp', EDIT, ['slatted', 'bench'])
    expect(said).toEqual({ answer: 'no', reason: 'This one is on a mesh floor' })
    expect(readImage).toHaveBeenCalledWith('/lib/side.webp')
    const req = complete.mock.calls[0]![0]
    expect(userParts(req)[0]).toEqual({ type: 'image_url', image_url: { url: IMAGE } })
    expect(userText(req)).toContain('The edit added: slatted, bench.')
    expect(req).toMatchObject({ temperature: 0, seed: 42 })
  })

  it('gives no reason with a yes, and throws on a reply that is neither', async () => {
    expect(await pileProvider({ judge: true }, { answer: 'yes', reason: 'it has a bench' }).provider.pileEdits!.check!('/c', EDIT, ['bench'])).toEqual({ answer: 'yes', reason: '' })
    await expect(pileProvider({ judge: true }, { answer: 'maybe', reason: '' }).provider.pileEdits!.check!('/c', EDIT, ['bench'])).rejects.toThrow()
  })

  it('throws when there is no cover to check, so the edit is offered', async () => {
    const { provider, readImage } = pileProvider({ judge: true }, { answer: 'yes', reason: '' })
    readImage.mockResolvedValueOnce(null)
    await expect(provider.pileEdits!.check!('/c', EDIT, ['bench'])).rejects.toThrow()
  })

  it("rewrites the variant's own description with the change, in a text request", async () => {
    const { provider, complete, readImage } = pileProvider(undefined, { description: 'A laptop on a white slatted bench by a grey mesh floor.', tags: ['x'] })
    expect(await provider.pileEdits!.rewrite!(EDIT, ENTRY)).toBe('A laptop on a white slatted bench by a grey mesh floor.')
    const req = complete.mock.calls[0]![0]
    expect(userParts(req).every((p) => p.type === 'text')).toBe(true)
    expect(userText(req)).toContain('Another mockup in the pile has this entry: "A laptop on a grey mesh floor." Tags: Laptop, floor.')
    expect(readImage).not.toHaveBeenCalled()
  })

  it('keeps the description, with no request, when an edit that only takes words out finds none of them', async () => {
    const { provider, complete } = pileProvider(undefined, { description: 'x', tags: [] })
    const removal = { before: { description: 'A mug on a saucer.', tags: ['saucer'] }, after: { description: 'A mug.', tags: [] } }
    expect(await provider.pileEdits!.rewrite!(removal, ENTRY)).toBe(ENTRY.description)
    expect(complete).not.toHaveBeenCalled()
  })

  it('throws on an empty rewrite, so the caller falls back to a copy', async () => {
    await expect(pileProvider(undefined, { description: ' ', tags: [] }).provider.pileEdits!.rewrite!(EDIT, ENTRY)).rejects.toThrow()
  })
})
