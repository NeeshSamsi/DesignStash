import { parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import { SHIPPED, requestFrom } from './tunable'

/**
 * Qwen3-VL 4B, round 1. Its search misses are the mockup type the names give (long scroll, mailer)
 * and its few inventions are materials (a "leather" velvet chair, a "flexible, solar" screen), so:
 * the names may supply the kind of mockup when the image fits, and materials only when clearly seen.
 */
const spec = {
  ...SHIPPED,
  namesRule:
    'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.',
  extraRules: ['- name a material or finish only when the image shows it clearly; otherwise leave it out.']
}

const version: PromptVersion = {
  id: 'q4-1',
  notes: 'Names may give the mockup type when the image fits; materials only when clearly seen.',
  buildRequest: requestFrom(spec),
  parseResult
}

export default version
