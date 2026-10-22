import { describe, expect, it } from 'vitest'
import type { InferenceResult } from '../../shared/inference'
import { SCENE_THINGS, mentionedThings, pYes, sceneQuestion, withoutThing } from './scene-check'

const answer = (title: string, description: string, labels: string[] = []): InferenceResult => ({
  title,
  description,
  tags: labels.map((label) => ({ category: 'Environment', label }))
})

const logprobs = (top: Record<string, number>) => ({
  content: [{ top_logprobs: Object.entries(top).map(([token, p]) => ({ token, logprob: Math.log(p) })) }]
})

describe('mentionedThings', () => {
  it('finds the listed scene things an answer mentions, singular or plural, in list order', () => {
    const a = answer('iMac on a wooden desk', 'An iMac beside two plants and a lamp.', ['desk', 'minimal'])
    expect(mentionedThings(a, SCENE_THINGS)).toEqual(['desk', 'plant', 'lamp'])
  })

  it('matches whole words only', () => {
    expect(mentionedThings(answer('Handbag on a bench', 'A tote bag on a bench.'), SCENE_THINGS)).toEqual([
      'bench'
    ])
  })
})

describe('pYes', () => {
  it('is yes over yes plus no, from the top logprobs of the answer token', () => {
    expect(pYes(logprobs({ yes: 0.3, no: 0.6, ' maybe': 0.1 }))).toBeCloseTo(1 / 3)
    expect(pYes(logprobs({ Yes: 0.1, ' yes': 0.1, no: 0.2 }))).toBeCloseTo(0.5)
  })

  it('is null when there is nothing to read', () => {
    expect(pYes(undefined)).toBeNull()
    expect(pYes({ content: [] })).toBeNull()
    expect(pYes(logprobs({ maybe: 1 }))).toBeNull()
  })
})

describe('sceneQuestion', () => {
  it('asks about one thing, with the right article', () => {
    expect(sceneQuestion('desk')).toBe('Is there a desk in this image? Answer yes or no.')
    expect(sceneQuestion('armchair')).toBe('Is there an armchair in this image? Answer yes or no.')
  })
})

describe('withoutThing', () => {
  it('takes the phrase that places the object on or by the thing out of title and description', () => {
    const a = answer(
      'iMac on a wooden desk',
      'An iMac, also called a desktop computer, on a wooden desk in soft light.',
      ['iMac', 'desk']
    )
    expect(withoutThing(a, 'desk')).toEqual(
      answer('iMac', 'An iMac, also called a desktop computer in soft light.', ['iMac'])
    )
  })

  it('takes a thing out of a list, and a plural tag with it', () => {
    const a = answer('Mug and plants', 'A white mug next to some plants, on a table.', ['mug', 'plants'])
    expect(withoutThing(a, 'plant')).toEqual(answer('Mug', 'A white mug, on a table.', ['mug']))
  })

  it('leaves other words that contain the thing alone', () => {
    const a = answer('Handheld phone', 'A phone held in one hand.', ['handheld'])
    expect(withoutThing(a, 'hand').tags).toEqual(a.tags)
  })

  it('keeps the title when taking the thing out would leave nothing', () => {
    const a = answer('A desk', 'A desk in a room.')
    expect(withoutThing(a, 'desk').title).toBe('A desk')
  })
})
