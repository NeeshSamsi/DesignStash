import { parseResult } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { SHIPPED, requestFrom } from './tunable'

/**
 * Apple, one change from ap-0. ap-1 changed several things at once and lost product names (its
 * names rule dropped the shipped "use that product name"), and its "never a colour or surface"
 * produced more of both. Here only the tag rule changes, worded as what to write: the things in
 * the scene, by name, so the rock, the chair and the water become tags.
 */
const spec = {
  ...SHIPPED,
  tags: '- tags: 3 to 6, each a thing by its name: the main object, anything placed with it, what it stands on or is surrounded by (a rock, a chair, water, a street), then the look. Most mockups use only some categories.'
}

export default appleVersion({
  id: 'ap-2',
  notes: 'ap-0 plus a tag rule that names scene things (rock, chair, water) instead of surfaces.',
  buildRequest: requestFrom(spec),
  parseResult
})
