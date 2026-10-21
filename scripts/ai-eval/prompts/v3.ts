import sharp from 'sharp'
import type { AnalysisInput } from '../../../src/shared/inference'
import { RESULT_JSON_SCHEMA, parseResult, readCoverAsDataUrl } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart } from '../../../src/main/ai/vision-provider'
import type { EvalResult, PromptVersion } from './prompt-version'

/**
 * v3: fixes what v1 and v2 got wrong, split between the prompt and code.
 *
 * Prompt: on v1 the 3B copied the prompt's own examples into its answers ("Isolated on a plain
 * background", "MacBook Pro on an orange armchair") and the 7B pasted the tote bag example into
 * MacBook entries, so the examples now describe a bicycle, far from anything in the library. The 7B
 * turned "other names and plural" into keyword lists, so the description is one natural sentence
 * with one or two other names; plurals are left to search. Printed words are named as template
 * filler, and the file name is a source of product names only.
 *
 * Code: a placeholder preview (Pixeden's "Remove this layer to start") is near-blank, so it is sent
 * as no image and the model goes by the names. The grammar keeps title and description to printable
 * ASCII (the 3B leaked Chinese characters), `repeat_penalty` 1.05 matches Qwen's own setting (the 7B
 * once wrote "phone" thirty times), and "free", "mockup", "PSD" and stock-site names are stripped
 * from what is saved.
 */

const SYSTEM = `You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English.`

const CATEGORIES: [string, string][] = [
  ['Device', 'screen devices: laptop, MacBook, phone, iPhone, tablet, monitor, smartwatch, TV'],
  ['Print & Branding', 'printed things and packaging: business card, poster, billboard, sign, box, packaging, label, book, stationery, envelope'],
  ['Apparel', 'clothing and merchandise: t-shirt, hoodie, cap, tote bag, mug, sticker'],
  ['Environment', 'the setting: indoor, outdoor, street, desk, floor, wall, water, floating'],
  ['Style', 'the look: minimal, realistic, 3D render, clay, dark, colorful'],
  ['Angle', 'front (camera level with the object), side (profile), angle (three-quarter view from above), top-down (looking straight down)']
]

const SEEN_LINE =
  '- seen: first, two or three plain sentences on what is in the picture: the main object and what it is made of, what it stands on or hangs from, the background, the colours, and where the camera is. Write the other fields from this.'

/** What a version built on v3 changes. v3 and v3b use the defaults, so their runs stay reproducible. */
export interface V3Options {
  seen: boolean
  /** The line after the names, when there is an image. */
  productLine?: string
  /** The line after the names, when there is no usable image. */
  noImageLine?: string
  /** The tags line. */
  tagLine?: string
  /** Strip free, mockup and the rest from the description too (v3 did; it left holes). */
  stripDescription?: boolean
  /** Fewest tags the grammar allows. */
  minTags?: number
}

const V3_PRODUCT_LINE =
  'The image shows what the mockup is. The names can add a product name or model, like "iPhone 16".'
const V3_TAG_LINE =
  '- tags: 3 to 6, each one thing that is really in the picture, in its category. Leave a category out when nothing in the picture fits it.'

function userText(input: AnalysisInput, hasImage: boolean, options: V3Options): string {
  const { seen } = options
  const lines = [
    hasImage ? 'The image above is the mockup preview.' : 'There is no usable preview image, so go by the names below.',
    `File name: ${input.fileName}`
  ]
  if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
  lines.push(
    hasImage
      ? (options.productLine ?? V3_PRODUCT_LINE)
      : (options.noImageLine ?? 'Describe the object the names point to, in your own words.'),
    '',
    'Words printed on the object (a brand, a slogan, "mockup", a website on a screen) are template filler a designer replaces. Leave them out of every field and describe the object itself.',
    '',
    `Reply with JSON: ${seen ? 'seen, ' : ''}title, description, tags.`,
    ...(seen ? [SEEN_LINE] : []),
    '- title: your own short name for the scene, at most 60 characters: the main object, its product name if known, and one detail of the setting. For a photo of a bike it would be "Red road bike against a garage door".',
    '- description: one natural sentence, at most 200 characters. Name the main object and, in the same sentence, one or two other words people use for it, then the setting and the main colours. For the bike: "A red road bike, also called a racing bicycle, leaning on a white garage door in afternoon sun."',
    options.tagLine ?? V3_TAG_LINE,
    '- labels are one or two plain words.',
    '',
    'Categories:',
    ...CATEGORIES.map(([c, d]) => `- ${c}: ${d}`)
  )
  return lines.join('\n')
}

/** Printable ASCII without `"` or `\`. Loose limits; the saved text is trimmed after. */
const plain = (max: number) => ({ type: 'string', pattern: `^[ !#-\\[\\]-~]{1,${max}}$` })

function schema(seen: boolean, minTags: number): object {
  return {
    ...RESULT_JSON_SCHEMA,
    properties: {
      ...(seen ? { seen: plain(600) } : {}),
      ...RESULT_JSON_SCHEMA.properties,
      title: plain(90),
      description: plain(300),
      tags: { ...RESULT_JSON_SCHEMA.properties.tags, minItems: minTags }
    },
    required: [...(seen ? ['seen'] : []), ...RESULT_JSON_SCHEMA.required]
  }
}

/** Below this greyscale entropy a cover is a blank page or a notice, never a product shot. */
export const PLACEHOLDER_ENTROPY = 1

export async function readUsableCover(path: string): Promise<string | null> {
  try {
    const { entropy } = await sharp(path).greyscale().resize(256, 256, { fit: 'inside' }).stats()
    if (entropy < PLACEHOLDER_ENTROPY) return null
  } catch {
    return null
  }
  return readCoverAsDataUrl(path)
}

const JUNK = /\b(free|mockups?|psd|templates?|pixeden|pixelbuddha|freepik|mockupfree|ls\.?graphics)\b/gi

/** Takes out the words every file in the library shares, then tidies what is left. */
export function stripJunk(text: string): string {
  return text
    .replace(/\b(a|an|the)\s+mockup\s+of\s+(a|an|the)\s+/gi, '$2 ')
    .replace(JUNK, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

function clipWords(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:]+$/, '')}…`
}

function tidy(result: EvalResult, stripDescription: boolean): EvalResult {
  const title = stripJunk(result.title) || result.title
  const text = stripDescription ? stripJunk(result.description) || result.description : result.description
  const description = clipWords(text.trim(), 200)
  const tags = result.tags
    .map((t) => ({ ...t, label: stripJunk(t.label) }))
    .filter((t) => t.label.length > 0)
  return { ...result, title: clipWords(title, 60), description, tags }
}

export function makeV3(id: string, seen: boolean, overrides: Omit<V3Options, 'seen'> & { notes?: string } = {}): PromptVersion {
  const options: V3Options = { seen, ...overrides }
  return {
    id,
    notes: overrides.notes ?? (seen
      ? 'Copying fixed (bicycle examples, printed words as filler, names for product names only), one natural sentence, ASCII grammar, repeat_penalty 1.05, placeholder covers sent as no image, junk words stripped. With the seen field.'
      : 'v3 without the seen field, to measure what that field adds.'),
    readImage: readUsableCover,
    buildRequest(input, imageUrl) {
      const content: ChatContentPart[] = []
      if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
      content.push({ type: 'text', text: userText(input, imageUrl !== null, options) })
      return {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'mockup', schema: schema(seen, options.minTags ?? 1) } },
        temperature: 0.2,
        repeat_penalty: 1.05,
        max_tokens: seen ? 700 : 450
      }
    },
    parseResult(raw) {
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) as { seen?: string }
      const result = tidy(parseResult(raw), options.stripDescription ?? true)
      return seen ? { ...result, extra: { seen: parsed.seen } } : result
    }
  }
}

export default makeV3('v3', true)
