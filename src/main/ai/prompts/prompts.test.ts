import { describe, expect, it } from 'vitest'
import type { AnalysisInput } from '../../../shared/inference'
import { buildRequest, parseResult, type ChatRequest } from '../vision-provider'
import { PROMPT_PROFILES, promptProfile } from '.'
import { profile as apple } from './apple'
import { profile as qwen35 } from './qwen3.5-9b'
import { profile as qwen3vl } from './qwen3-vl-4b'

const INPUT: AnalysisInput = {
  imagePath: '/library/mockups/1/cover.webp',
  fileName: 'Hanging Duct Tape Mockup.psd',
  folderTrail: ['Tape']
}
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

  it.each([
    ['qwen3-vl-4b', qwen3vl],
    ['qwen3.5-9b', qwen35],
    ['apple', apple]
  ])('%s builds and parses exactly like the shipped request for now', (_id, profile) => {
    expect(profile.buildRequest(INPUT, 'data:image/jpeg;base64,AA')).toEqual(
      buildRequest(INPUT, 'data:image/jpeg;base64,AA')
    )
    expect(profile.buildRequest(INPUT, null)).toEqual(buildRequest(INPUT, null))
    expect(profile.parseResult(REPLY)).toEqual(parseResult(REPLY))
  })

  it('looks a profile up by id, and has none for an unknown id', () => {
    expect(promptProfile('qwen3.5-9b')).toBe(qwen35)
    expect(promptProfile('qwen2.5-vl-3b')).toBeUndefined()
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
