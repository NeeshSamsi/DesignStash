import { describe, expect, it } from 'vitest'
import { summariseObjectColours } from './object-colour'

describe('summariseObjectColours', () => {
  it('gives the share of answers with one, and the mentions per answer', () => {
    expect(summariseObjectColours([{ id: 'a', repeat: 0, words: ['white mug'] }, { id: 'b', repeat: 0, words: [] }])).toEqual({ answers: 2, mentioned: 0.5, wordsPerAnswer: 0.5 })
  })
})
