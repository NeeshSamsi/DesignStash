import { parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { SHIPPED, requestFrom } from './tunable'

/** Apple, one change from ap-0: q4-1's names rule, which keeps "use the product name" and adds the mockup type. */
const spec = {
  ...SHIPPED,
  namesRule:
    'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.'
}

export default appleVersion({
  id: 'ap-3',
  notes: "ap-0 plus q4-1's names rule (mockup type from the names when the image fits).",
  buildRequest: requestFrom(spec),
  parseResult
})
