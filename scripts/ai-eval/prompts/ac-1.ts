import { NAMES_ONLY, SHIPPED } from '../../../src/main/ai/prompts/request'
import { appR4 } from './r4'

/**
 * Round 4, Apple's "also called" names (design/research/ai-round4.md): the shipped profile, no
 * longer asked for "one or two other words people use for it", with or without an image. The bike
 * example loses its "also called a racing bicycle".
 */
export default appR4({
  id: 'ac-1',
  notes: 'No other names: the description asks for none.',
  swap: [
    [
      SHIPPED.description,
      '- description: one natural sentence, at most 200 characters. Name the main object, then the setting and the main colours. For the bike: "A red road bike leaning on a white garage door in afternoon sun."'
    ],
    [
      NAMES_ONLY.description,
      '- description: one natural sentence, at most 200 characters, about the object the names point to. Only what the names tell you: no colours, light, setting or surface.'
    ]
  ]
})
