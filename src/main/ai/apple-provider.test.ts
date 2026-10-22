import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisInput } from '../../shared/inference'
import { HelperError, NativeHelper } from '../native/helper'
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
