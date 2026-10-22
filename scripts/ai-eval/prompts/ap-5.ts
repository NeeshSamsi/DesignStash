import { parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { NAMES_ONLY, SHIPPED, requestFrom } from './tunable'

/** Apple: ap-3 plus the names-only rules for a placeholder cover. */
const spec = {
  ...SHIPPED,
  namesRule:
    'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.',
  noImage: NAMES_ONLY
}

export default appleVersion({
  id: 'ap-5',
  notes: 'ap-3 plus names-only description and tag rules.',
  buildRequest: requestFrom(spec),
  parseResult
})
