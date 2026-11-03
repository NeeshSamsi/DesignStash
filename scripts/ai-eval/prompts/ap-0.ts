import { buildRequest, parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'

/** Baseline: the shipped request on Apple's on-device model through the Swift helper, with guided JSON. */
export default appleVersion({
  id: 'ap-0',
  notes: "The shipped prompt and parser on Apple's on-device model via designstash-helper describe, schema-guided.",
  buildRequest,
  parseResult
})
