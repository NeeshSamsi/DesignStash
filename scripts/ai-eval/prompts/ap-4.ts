import { parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { SHIPPED, requestFrom } from './tunable'

/**
 * Apple, one change from ap-3: the description asks for another name only when it is a real everyday
 * one, since ap-0 filled "also called" with "a mock-up", "a template", "a design", "a face".
 */
const spec = {
  ...SHIPPED,
  namesRule:
    'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.',
  description:
    '- description: one natural sentence, at most 200 characters. Name the main object; if people also call it by another everyday name, add it ("a tote bag, also called a shopping bag"). Then the setting and the main colours.'
}

export default appleVersion({
  id: 'ap-4',
  notes: 'ap-3 plus "another name only if it is a real everyday one".',
  buildRequest: requestFrom(spec),
  parseResult
})
