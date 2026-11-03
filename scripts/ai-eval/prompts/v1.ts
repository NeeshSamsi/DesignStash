import type { AnalysisInput } from '../../../src/shared/inference'
import { RESULT_JSON_SCHEMA, parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart } from '../../../src/main/ai/vision-provider'
import type { PromptVersion } from './prompt-version'

/**
 * v1: same schema and settings as v0; the words change. Written for search: the prompt says a
 * designer finds the mockup later by typing a few words, and asks for the other names people use.
 * Category notes follow the seed taxonomy (v0 put "bag" in two categories), tags are given only
 * where true, the four angles are defined, and a placeholder preview defers to the file name.
 */

const SYSTEM = `You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found.`

const CATEGORIES: [string, string][] = [
  ['Device', 'a screen device in the picture: laptop, MacBook, phone, iPhone, tablet, monitor, smartwatch, TV'],
  ['Print & Branding', 'printed things and packaging: business card, poster, flyer, billboard, sign, box, packaging, label, book, stationery, envelope'],
  ['Apparel', 'clothing and merchandise: t-shirt, hoodie, cap, tote bag, mug, sticker'],
  ['Environment', 'where it is: indoor, outdoor, street, desk, floor, wall, isolated on a plain background, floating'],
  ['Style', 'the look: minimal, realistic, 3D render, clay, dark, colorful'],
  ['Angle', 'front (camera level with the object), side (profile), angle (three-quarter view from above), top-down (looking straight down)']
]

function userText(input: AnalysisInput, hasImage: boolean): string {
  const names = [`File name: ${input.fileName}`]
  if (input.folderTrail.length > 0) names.push(`Folders: ${input.folderTrail.join(' / ')}`)
  return [
    hasImage
      ? 'The image above is the mockup preview.'
      : 'There is no preview image, so go by the names below.',
    ...names,
    hasImage
      ? 'Use the image for what is shown and the names for product names (like "iPhone 16" or "Z-fold brochure"). When they disagree about the object, trust the image. When the image is only a notice or instructions (like "Remove this layer to start"), describe the mockup from the names.'
      : '',
    '',
    'Reply with JSON: title, description, tags.',
    '- title: the main object and one detail of the scene, at most 60 characters, in plain words. Use the product name when it is clear: "MacBook Pro on an orange armchair", "Canvas tote bag on the floor".',
    '- description: one sentence, at most 200 characters, a designer would search with. Name the main object, then its other common names and its plural (tote bags, canvas shopping bags), the setting, and the main colours. Describe things; leave out any words printed on them.',
    '- tags: 3 to 6, each one thing that is really in the picture, in its category. Most mockups use only some categories.',
    '- labels are one or two plain words: "iPhone", "Tote bag", "Concrete wall".',
    '',
    'Categories:',
    ...CATEGORIES.map(([c, d]) => `- ${c}: ${d}`)
  ]
    .filter((l, i, all) => l !== '' || all[i - 1] !== '')
    .join('\n')
}

const v1: PromptVersion = {
  id: 'v1',
  notes:
    'Search-first wording: other names and plurals in the description, tags only where true, angles defined, categories match the seed, placeholder previews defer to the file name. Schema and settings as v0.',
  buildRequest(input, imageUrl) {
    const content: ChatContentPart[] = []
    if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
    content.push({ type: 'text', text: userText(input, imageUrl !== null) })
    return {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'mockup', schema: RESULT_JSON_SCHEMA } },
      temperature: 0.2,
      max_tokens: 400
    }
  },
  parseResult
}

export default v1
