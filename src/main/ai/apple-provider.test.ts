import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisInput } from '../../shared/inference'
import { HelperError, NativeHelper, type DescribeRequest } from '../native/helper'
import { SCENE_THINGS } from './scene-check'
import { AppleInferenceProvider, appleDescribeRequest, withoutPatterns } from './apple-provider'
import type { PromptProfile } from './prompts'
import { RESULT_JSON_SCHEMA, buildRequest, parseResult, type ChatContentPart } from './vision-provider'

const SHIPPED: PromptProfile = { buildRequest, parseResult }
const FAKE = resolve('src/main/native/__fixtures__/fake-helper.mjs')

const INPUT: AnalysisInput = {
  imagePath: '/library/mockups/1/cover.webp',
  fileName: ' Hanging Duct Tape Mockup.psd',
  folderTrail: ['Tape']
}

let dir: string
let logPath: string
let helper: NativeHelper

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds-apple-'))
  logPath = join(dir, 'log.txt')
  process.env.FAKE_HELPER_LOG = logPath
  helper = new NativeHelper({ binaryPath: process.execPath, args: [FAKE] })
})

afterEach(async () => {
  await helper.stop()
  delete process.env.FAKE_HELPER_LOG
  rmSync(dir, { recursive: true, force: true })
})

/** The args of every describe the fake helper got. */
const sent = () =>
  (existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n') : [])
    .filter((l) => l.startsWith('req ') && l.split(' ')[2] === 'describe')
    .map((l) => JSON.parse(l.split(' ').slice(3).join(' ')) as Record<string, unknown>)

const textOf = (input: AnalysisInput, hasImage: boolean) =>
  (buildRequest(input, hasImage ? 'image' : null).messages[1]!.content as ChatContentPart[])
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join('\n')

describe('AppleInferenceProvider', () => {
  it('asks the helper with the cover and returns the parsed suggestion', async () => {
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper, hasUsableCover: async () => true })
    const result = await provider.analyze(INPUT)
    expect(result.title).toBe('Tape roll on a wall')
    // parseResult's rules apply: the Angle tag is never suggested.
    expect(result.tags).toEqual([
      { category: 'Print & Branding', label: 'tape' },
      { category: 'Environment', label: 'wall' }
    ])
  })

  it("sends the app's own prompt and schema, the schema without patterns", async () => {
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper, hasUsableCover: async () => true })
    await provider.analyze(INPUT)
    const request = buildRequest(INPUT, 'image')
    expect(sent()).toEqual([
      {
        path: INPUT.imagePath,
        instructions: request.messages[0]!.content,
        prompt: textOf(INPUT, true),
        schema: withoutPatterns(RESULT_JSON_SCHEMA),
        maxTokens: request.max_tokens
      }
    ])
  })

  it('describes from the names alone when the cover is missing or a placeholder', async () => {
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper, hasUsableCover: async () => false })
    const result = await provider.analyze(INPUT)
    expect(result.title).toBe('Tape roll')
    const [args] = sent()
    expect(args!.path).toBeNull()
    expect(args!.prompt).toBe(textOf(INPUT, false))
  })

  it('treats a near-blank cover as a placeholder by default', async () => {
    const blank = join(dir, 'blank.png')
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } })
      .png()
      .toFile(blank)
    await new AppleInferenceProvider({ prompt: SHIPPED, helper }).analyze({ ...INPUT, imagePath: blank })
    expect(sent()[0]!.path).toBeNull()
  })

  it("asks in the words of the model's prompt profile and reads the reply with it", async () => {
    const tuned = buildRequest(INPUT, 'image')
    const prompt: PromptProfile = {
      buildRequest: (input, imageUrl) => ({
        ...buildRequest(input, imageUrl),
        messages: [{ role: 'system', content: 'Tuned instructions.' }, tuned.messages[1]!],
        max_tokens: 300
      }),
      parseResult: (text) => ({ ...parseResult(text), title: 'Read by the profile' })
    }
    const provider = new AppleInferenceProvider({ prompt, helper, hasUsableCover: async () => true })
    await expect(provider.analyze(INPUT)).resolves.toMatchObject({ title: 'Read by the profile' })
    expect(sent()[0]).toMatchObject({ instructions: 'Tuned instructions.', maxTokens: 300 })
  })

  it('passes a helper failure on to the queue', async () => {
    const provider = new AppleInferenceProvider({
      prompt: SHIPPED,
      helper: new NativeHelper({ binaryPath: null }),
      hasUsableCover: async () => true
    })
    await expect(provider.analyze(INPUT)).rejects.toBeInstanceOf(HelperError)
  })

  it('exposes id "apple" and a name', () => {
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper })
    expect(provider.id).toBe('apple')
    expect(provider.name).toBe("Apple's on-device model")
  })
})

describe('AppleInferenceProvider scene-thing check', () => {
  const DESK = JSON.stringify({
    title: 'iMac on a wooden desk',
    description: 'An iMac on a wooden desk beside a plant.',
    tags: [
      { category: 'Device', label: 'iMac' },
      { category: 'Environment', label: 'desk' },
      { category: 'Environment', label: 'plant' }
    ]
  })
  const CHECKED: PromptProfile = { ...SHIPPED, sceneThings: SCENE_THINGS }

  /** A helper that gives the answer, then the given yes or no for each thing it is asked about. */
  function stubHelper(answers: Record<string, 'yes' | 'no' | Error>) {
    const calls: DescribeRequest[] = []
    const describe = async (request: DescribeRequest) => {
      calls.push(request)
      const thing = /Is there an? ([a-z]+) in this image/.exec(request.prompt)?.[1]
      if (!thing) return { text: DESK, json: true, ms: 1 }
      const said = answers[thing]!
      if (said instanceof Error) throw said
      return { text: JSON.stringify({ answer: said }), json: true, ms: 1 }
    }
    return { helper: { describe }, calls }
  }

  it('takes out a thing the model says no to, and keeps one it says yes to', async () => {
    const { helper: stub } = stubHelper({ desk: 'no', plant: 'yes' })
    const provider = new AppleInferenceProvider({ prompt: CHECKED, helper: stub, hasUsableCover: async () => true })
    const result = await provider.analyze(INPUT)
    expect(result.title).toBe('iMac')
    expect(result.description).toBe('An iMac beside a plant.')
    expect(result.tags.map((t) => t.label)).toEqual(['iMac', 'plant'])
  })

  it('asks each thing about the same cover, as a yes or no held by a schema', async () => {
    const { helper: stub, calls } = stubHelper({ desk: 'yes', plant: 'yes' })
    const provider = new AppleInferenceProvider({ prompt: CHECKED, helper: stub, hasUsableCover: async () => true })
    await provider.analyze(INPUT)
    expect(calls).toHaveLength(3)
    expect(calls[1]).toEqual({
      imagePath: INPUT.imagePath,
      instructions: 'You answer questions about one image, looking only at the image.',
      prompt: 'Is there a desk in this image? Answer yes or no.',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string', enum: ['yes', 'no'] } },
        required: ['answer']
      },
      maxTokens: 10
    })
  })

  it('checks nothing when the cover is a placeholder', async () => {
    const { helper: stub, calls } = stubHelper({})
    const provider = new AppleInferenceProvider({ prompt: CHECKED, helper: stub, hasUsableCover: async () => false })
    await provider.analyze(INPUT)
    expect(calls).toHaveLength(1)
  })

  it('keeps a thing whose check fails or answers something else', async () => {
    const { helper: stub } = stubHelper({ desk: new Error('helper crashed'), plant: 'maybe' as 'yes' })
    const provider = new AppleInferenceProvider({ prompt: CHECKED, helper: stub, hasUsableCover: async () => true })
    const result = await provider.analyze(INPUT)
    expect(result.tags.map((t) => t.label)).toEqual(['iMac', 'desk', 'plant'])
  })
})

describe('AppleInferenceProvider with a masked design slot', () => {
  const MASKED = '/library/mockups/1/cover-ai-soft.png'
  const LAMP = JSON.stringify({ title: 'Cube lamp', description: 'A white cube lamp on a dark base.', tags: [{ category: 'Environment', label: 'lamp' }] })
  const BOXES = JSON.stringify({ title: 'Stacked boxes', description: 'Three stacked boxes on a dark base.', tags: [] })

  function stub(redoFails = false) {
    const calls: DescribeRequest[] = []
    const describe = async (request: DescribeRequest) => {
      calls.push(request)
      if (/Is there a lamp/.test(request.prompt)) return { text: JSON.stringify({ answer: 'no' }), json: true, ms: 1 }
      if (/there is no lamp in it/.test(request.prompt)) {
        if (redoFails) throw new Error('helper crashed')
        return { text: BOXES, json: true, ms: 1 }
      }
      return { text: LAMP, json: true, ms: 1 }
    }
    return { helper: { describe }, calls }
  }
  const provider = (helper: Pick<NativeHelper, 'describe'>, profile: Partial<PromptProfile> = {}, mask: string | null = MASKED) =>
    new AppleInferenceProvider({
      prompt: { ...SHIPPED, sceneThings: SCENE_THINGS, mask: 'soft', ...profile },
      helper,
      hasUsableCover: async () => true,
      maskedCover: async () => mask
    })

  it('answers from the masked cover and checks the cover as it is', async () => {
    const { helper, calls } = stub()
    await provider(helper).analyze(INPUT)
    expect(calls[0]!.imagePath).toBe(MASKED)
    expect(calls[1]!.imagePath).toBe(INPUT.imagePath)
  })

  it('answers from the cover as it is without a slot mask', async () => {
    const { helper, calls } = stub()
    await provider(helper, {}, null).analyze(INPUT)
    expect(calls[0]!.imagePath).toBe(INPUT.imagePath)
  })

  it('with redo, asks again once about the masked cover, told what is not there', async () => {
    const { helper, calls } = stub()
    await expect(provider(helper, { redo: true }).analyze(INPUT)).resolves.toMatchObject({ title: 'Stacked boxes' })
    expect(calls).toHaveLength(3)
    expect(calls[2]!.imagePath).toBe(MASKED)
    expect(calls[2]!.prompt).toContain('Checked against the image: there is no lamp in it.')
  })

  it('keeps the first answer, less the refused thing, when asking again fails', async () => {
    const { helper } = stub(true)
    const result = await provider(helper, { redo: true }).analyze(INPUT)
    expect(result.title).toBe('Cube lamp')
    expect(result.tags).toEqual([])
  })
})

describe('appleDescribeRequest', () => {
  it('carries a pile variant into the prompt like the vision request', () => {
    const variant: AnalysisInput = {
      ...INPUT,
      groupContext: { originalTitle: 'Tape roll', originalDescription: 'A roll.', originalTags: [] }
    }
    expect(appleDescribeRequest(variant, true, SHIPPED).prompt).toContain('This is a variant of "Tape roll"')
  })
})

describe('withoutPatterns', () => {
  it('drops every pattern and leaves the rest of the schema as it was', () => {
    const schema = withoutPatterns(RESULT_JSON_SCHEMA) as typeof RESULT_JSON_SCHEMA
    expect(JSON.stringify(schema)).not.toContain('pattern')
    expect(schema.properties.title).toEqual({ type: 'string' })
    expect(schema.properties.tags).toEqual(RESULT_JSON_SCHEMA.properties.tags)
    expect(schema.required).toEqual(RESULT_JSON_SCHEMA.required)
  })
})

describe('AppleInferenceProvider pile edits', () => {
  const EDIT = {
    before: { description: 'A mug on a light grey background.', tags: ['Mug'] },
    after: { description: 'A round mug on a light grey background.', tags: ['Mug', 'round'] }
  }
  const ENTRY = { description: 'An oval mug on a white table.', tags: ['Mug', 'table'] }

  function stubHelper(text: string) {
    const calls: DescribeRequest[] = []
    return { helper: { describe: async (r: DescribeRequest) => (calls.push(r), { text, json: true, ms: 1 }) }, calls }
  }

  it('judges no pile edits', () => {
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper: stubHelper('{}').helper })
    expect(provider.pileEdits.check).toBeUndefined()
  })

  it("rewrites the variant's own description with the change, from the text alone", async () => {
    const { helper: stub, calls } = stubHelper(JSON.stringify({ description: 'A round mug on a white table.', tags: [] }))
    const provider = new AppleInferenceProvider({ prompt: SHIPPED, helper: stub })
    expect(await provider.pileEdits.rewrite!(EDIT, ENTRY)).toBe('A round mug on a white table.')
    expect(calls[0]).toMatchObject({ imagePath: null, maxTokens: 400 })
    expect(calls[0]!.prompt).toContain('Another mockup in the pile has this entry: "An oval mug on a white table."')
  })

  it('gives no rewrite step for a profile that copies', () => {
    const provider = new AppleInferenceProvider({ prompt: { ...SHIPPED, pileEdits: { copy: true } }, helper: stubHelper('{}').helper })
    expect(provider.pileEdits.rewrite).toBeUndefined()
  })
})
