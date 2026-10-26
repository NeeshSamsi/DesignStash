import { describe, expect, it } from 'vitest'
import type { AnalysisInput } from '../../../shared/inference'
import { buildRequest, parseResult, type ChatContentPart, type ChatRequest } from '../vision-provider'
import { SCENE_THINGS } from '../scene-check'
import { PROMPT_PROFILES, promptProfile } from '.'
import { MASK_RULE, SHIPPED, requestFrom } from './request'
import { profile as apple } from './apple'
import { profile as qwen35 } from './qwen3.5-9b'
import { profile as qwen3vl } from './qwen3-vl-4b'

const INPUT: AnalysisInput = {
  imagePath: '/library/mockups/1/cover.webp',
  fileName: 'Hanging Duct Tape Mockup.psd',
  folderTrail: ['Tape']
}
const IMAGE = 'data:image/jpeg;base64,AA'
const textOf = (request: ChatRequest) =>
  (request.messages[1]!.content as ChatContentPart[])
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join('\n')
const tagsSchema = (request: ChatRequest) =>
  (request.response_format.json_schema.schema as { properties: { tags: object } }).properties.tags

const REPLY = JSON.stringify({
  title: 'Tape roll on a wall',
  description: 'A roll of tape on a white wall.',
  tags: [
    { category: 'Print & Branding', label: 'tape' },
    { category: 'Angle', label: 'front' }
  ]
})

describe('prompt profiles', () => {
  it('has one per model id, each its own module', () => {
    expect(Object.keys(PROMPT_PROFILES).sort()).toEqual(['apple', 'qwen3-vl-4b', 'qwen3.5-9b'])
    expect(PROMPT_PROFILES['qwen3-vl-4b']).toBe(qwen3vl)
    expect(PROMPT_PROFILES['qwen3.5-9b']).toBe(qwen35)
    expect(PROMPT_PROFILES.apple).toBe(apple)
  })

  it('parses every reply with the shipped parseResult', () => {
    for (const profile of [qwen3vl, qwen35, apple]) {
      expect(profile.parseResult(REPLY)).toEqual(parseResult(REPLY))
    }
  })

  it("names a pile's variations with the 4B and the 9B, and leaves Apple's piles to the fallback (round 4 B)", () => {
    expect(qwen3vl.variations).toBe(true)
    expect(qwen35.variations).toBe(true)
    expect(apple.variations).toBeUndefined()
  })

  it('checks the scene things from the tuning, for every model', () => {
    for (const profile of [qwen3vl, qwen35, apple]) expect(profile.sceneThings).toBe(SCENE_THINGS)
  })

  it.each([
    ['qwen3-vl-4b', qwen3vl],
    ['qwen3.5-9b', qwen35]
  ])('%s asks the shipped request when there is an image', (_id, profile) => {
    expect(profile.buildRequest(INPUT, IMAGE)).toEqual(buildRequest(INPUT, IMAGE))
  })

  it.each([
    ['qwen3-vl-4b', qwen3vl],
    ['qwen3.5-9b', qwen35],
    ['apple', apple]
  ])('%s sticks to what the names say when there is no image, with 1 to 6 tags', (_id, profile) => {
    const request = profile.buildRequest(INPUT, null)
    const text = textOf(request)
    expect(text).toContain('Only what the names tell you: no colours, light, setting or surface.')
    expect(text).toContain('- tags: 1 to 6, only the object and its kind, from the names.')
    expect(text).not.toContain('then the setting and the main colours')
    expect(tagsSchema(request)).toMatchObject({ minItems: 1, maxItems: 6 })
    expect(tagsSchema(profile.buildRequest(INPUT, IMAGE))).toMatchObject({ minItems: 3, maxItems: 6 })
  })

  it('asks Apple’s model to use the mockup type from the names when the image fits', () => {
    const text = textOf(apple.buildRequest(INPUT, IMAGE))
    expect(text).toContain(
      'The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.'
    )
    expect(text).not.toContain('When it shows the kind of product the names mention')
  })

  it("shows Apple's model the cover with its design slot blurred in grey, and asks again on a refusal", () => {
    expect(apple).toMatchObject({ mask: 'soft', redo: true })
    expect(textOf(apple.buildRequest({ ...INPUT, slotMasked: true }, IMAGE))).not.toContain('has been blanked out')
  })

  it('shows the 4B the cover with its design slot labelled (blurred where the label leaves it blank), names the object from the cover as it is, and asks again on a refusal', () => {
    expect(qwen3vl).toMatchObject({ mask: 'label', blankFallback: 'soft', redo: true, objectHint: true })
    const text = textOf(qwen3vl.buildRequest({ ...INPUT, slotMasked: true }, IMAGE))
    expect(text).toContain(`${SHIPPED.printedRule}\n${MASK_RULE}`)
    expect(MASK_RULE).toContain('never write the words design area')
    expect(textOf(qwen3vl.buildRequest(INPUT, IMAGE))).not.toContain(MASK_RULE)
  })

  it('answers the 9B from the cover as it is, checks its colour and pattern words on the blurred slot, and answers again from the labelled cover', () => {
    expect(qwen35).toMatchObject({ verify: { check: 'soft', remask: 'label' }, redo: true })
    expect(qwen35.mask).toBeUndefined()
    expect(qwen35.blankFallback).toBeUndefined()
    expect(textOf(qwen35.buildRequest({ ...INPUT, slotMasked: true }, IMAGE))).toContain(`${SHIPPED.printedRule}\n${MASK_RULE}`)
    expect(textOf(qwen35.buildRequest(INPUT, IMAGE))).not.toContain(MASK_RULE)
  })

  it("checks the 4B's scene things on the cover scaled to 512 px, and every other model's at full size (round 4)", () => {
    expect(qwen3vl.checkEdge).toBe(512)
    expect(PROMPT_PROFILES.apple.checkEdge).toBeUndefined()
    expect(PROMPT_PROFILES['qwen3.5-9b'].checkEdge).toBeUndefined()
  })

  it('looks a profile up by id, and has none for an unknown id', () => {
    expect(promptProfile('qwen3.5-9b')).toBe(qwen35)
    expect(promptProfile('qwen2.5-vl-3b')).toBeUndefined()
  })
})

describe('requestFrom', () => {
  it('rebuilds the shipped request exactly from the shipped spec', () => {
    const variant = { ...INPUT, groupContext: { originalTitle: 'T', originalDescription: 'D', originalTags: [{ category: 'Device', label: 'tape' }] } }
    for (const input of [INPUT, variant, { ...INPUT, folderTrail: [] }]) {
      expect(requestFrom(SHIPPED)(input, IMAGE)).toEqual(buildRequest(input, IMAGE))
      expect(requestFrom(SHIPPED)(input, null)).toEqual(buildRequest(input, null))
    }
  })
})

describe('requestFrom with a mask rule', () => {
  const text = (req: ChatRequest) =>
    (req.messages[1]!.content as ChatContentPart[]).flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
  const spec = { ...SHIPPED, maskRule: MASK_RULE }

  it('says the rule after the printed-words rule when the cover shown has its slot painted over', () => {
    const t = text(requestFrom(spec)({ ...INPUT, slotMasked: true }, IMAGE))
    expect(t).toContain(`${SHIPPED.printedRule}\n${MASK_RULE}`)
  })

  it('says nothing about a mask when the cover is shown as it is, or not at all', () => {
    expect(text(requestFrom(spec)(INPUT, IMAGE))).not.toContain(MASK_RULE)
    expect(text(requestFrom(spec)({ ...INPUT, slotMasked: true }, null))).not.toContain(MASK_RULE)
  })
})

describe('ChatRequest', () => {
  it('can carry every sampling setting a tuned prompt may set', () => {
    const tuned: ChatRequest = {
      ...buildRequest(INPUT, null),
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
      repeat_penalty: 1,
      presence_penalty: 1.5,
      seed: 7,
      max_tokens: 300
    }
    expect(tuned).toMatchObject({ top_k: 20, presence_penalty: 1.5, seed: 7 })
  })
})
