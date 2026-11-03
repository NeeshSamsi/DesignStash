import { parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { SHIPPED, requestFrom, schemaWithTags } from './tunable'

/**
 * Apple's on-device model, round 1. Against ap-0 it gives exactly three tags, mostly filler
 * ("white surface", "background", "minimal" on nearly all), drops objects it does mention (the
 * business cards), and fills "also called" with "a mock-up", "a template", "a design". So: the
 * names' product or type words, four to six tags with objects first and no surfaces or colours,
 * and another name only when it is a real everyday one.
 */
const spec = {
  ...SHIPPED,
  namesRule:
    'The names usually say the product (a MacBook, an iPhone 16, an Apple Watch Ultra) or the kind of mockup (a long scroll website, postal packages, business cards). Keep those words in the title and tags unless the image clearly shows something else. File names that say nothing about the object ("Board", "Archive", a code) can be ignored.',
  description:
    '- description: one natural sentence, at most 200 characters. Name the main object; if people also call it by another everyday name, add it ("a tote bag, also called a shopping bag"). Then the setting and the main colours. Never call anything a mockup, template or design.',
  tags: '- tags: 4 to 6. First each object you can see (the main object and anything placed with it), then the setting, then the look. A tag is something a person would search for: never a colour, "background" or "surface".',
  schema: schemaWithTags(4, 6)
}

export default appleVersion({
  id: 'ap-1',
  notes: 'Names product/type words; 4 to 6 tags, objects first, no surfaces or colours; real other names only.',
  buildRequest: requestFrom(spec),
  parseResult
})
