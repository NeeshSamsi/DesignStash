import { parseResult } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'
import { SHIPPED, requestFrom, schemaWithTags } from './tunable'

/**
 * Qwen3-VL 4B, round 2. q4-1 helped a little, but the model still drops the names' words (postal
 * packages became envelopes, MacBooks became laptops) and stops at three tags, mostly filler
 * (indoor, floor, minimal). So: start from the names' product or mockup type unless the image clearly
 * shows something else, and four to six tags, every visible object first.
 */
const spec = {
  ...SHIPPED,
  namesRule:
    'The names usually say the product (a MacBook, an iPhone 16, an Apple Watch Ultra) or the kind of mockup (a long scroll website, postal packages, business cards). Keep those words in the title and tags unless the image clearly shows something else. File names that say nothing about the object ("Board", "Archive", a code) can be ignored.',
  tags: '- tags: 4 to 6. First each object you can see (the main object and anything placed with it), then the setting, then the look. Each one is really in the picture, in its category.',
  extraRules: ['- name a material or finish only when the image shows it clearly; otherwise leave it out.'],
  schema: schemaWithTags(4, 6)
}

const version: PromptVersion = {
  id: 'q4-2',
  notes: 'Keep the names product/type words unless the image disagrees; 4 to 6 tags, objects first.',
  buildRequest: requestFrom(spec),
  parseResult
}

export default version
