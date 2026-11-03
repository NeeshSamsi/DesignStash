import type { AnalysisInput } from '../../../src/shared/inference'
import { parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart } from '../../../src/main/ai/vision-provider'
import type { EvalResult, PromptVersion } from './prompt-version'
import { readUsableCover, stripJunk } from './v3'
import { stripQuoted } from './v5'

/**
 * v6: v4, the best run so far, plus what v5 taught.
 *
 * v5 showed the models copy whatever vocabulary the prompt shows them: with no examples, keywords
 * came back as "design, branding, technology" and Device filled with "Screen". So v6 shows them the
 * vocabulary we want copied. Keywords start with the kind of thing it is, picked from the words the
 * app's own Print & Branding, Apparel and Device tags use (packaging, stationery, signage...), then
 * other names for the object, with the far-domain bicycle as the only example of those. Category
 * lines keep v4's example labels, since without them tags drifted into moods. Angle is gone (half of
 * the 7B's wrong tags in v4). v5's quoted-text cut stays; it worked.
 */

const SYSTEM = `You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English.`

export const KINDS = [
  'device',
  'screen',
  'packaging',
  'stationery',
  'print',
  'signage',
  'outdoor advertising',
  'apparel',
  'merchandise',
  'bag',
  'label',
  'book'
]

const CATEGORIES: [string, string][] = [
  ['Device', 'screen devices: laptop, MacBook, phone, iPhone, tablet, monitor, smartwatch, TV'],
  ['Print & Branding', 'printed things and packaging: business card, poster, billboard, sign, box, packaging, label, book, stationery, envelope'],
  ['Apparel', 'clothing and merchandise: t-shirt, hoodie, cap, tote bag, mug, sticker'],
  ['Environment', 'the setting: indoor, outdoor, street, desk, floor, wall, water, floating'],
  ['Style', 'the look: minimal, realistic, 3D render, clay, dark, colorful']
]

function userText(input: AnalysisInput, hasImage: boolean, keywords: boolean): string {
  const lines = [
    hasImage ? 'The image above is the mockup preview.' : 'There is no usable preview image, so go by the names below.',
    `File name: ${input.fileName}`
  ]
  if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
  lines.push(
    hasImage
      ? 'The image shows what the mockup is. When it shows the kind of product the names mention (a MacBook, an iPhone 16, an Apple Watch Ultra), use that product name.'
      : "Describe the object the names point to, in your own words. You can't see the setting, so leave it out.",
    '',
    'Words printed on the object (a brand, a slogan, "mockup", a website on a screen) are template filler a designer replaces. Leave them out of every field and describe the object itself.',
    '',
    `Reply with JSON: title, description, ${keywords ? 'keywords, ' : ''}tags.`,
    '- title: your own short name for the scene, at most 60 characters: the main object, its product name if known, and one detail of the setting. For a photo of a bike it would be "Red road bike against a garage door".',
    '- description: one natural sentence, at most 200 characters. Name the main object and, in the same sentence, one or two other words people use for it, then the setting and the main colours. For the bike: "A red road bike, also called a racing bicycle, leaning on a white garage door in afternoon sun."',
    ...(keywords
      ? [
          `- keywords: 3 to 6 words a designer would type to find this. First the kind of thing it is, using the words from this list that fit: ${KINDS.join(', ')}. Then other everyday names for the main object, the way a bike is also a bicycle or a cycle.`
        ]
      : []),
    '- tags: 3 to 6, each one thing that is really in the picture, in its category. Most mockups use only some categories.',
    '- labels are one or two plain words.',
    '',
    'Categories:',
    ...CATEGORIES.map(([c, d]) => `- ${c}: ${d}`)
  )
  return lines.join('\n')
}

/** Printable ASCII without `"`, `\`, `<` or `>`. */
const plain = (max: number) => ({ type: 'string', pattern: `^[ !#-;=?-\\[\\]-~]{1,${max}}$` })

const schema = (keywords: boolean) => ({
  type: 'object',
  properties: {
    title: plain(90),
    description: plain(300),
    ...(keywords ? { keywords: { type: 'array', minItems: 3, maxItems: 6, items: plain(40) } } : {}),
    tags: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORIES.map(([c]) => c) },
          label: plain(30)
        },
        required: ['category', 'label']
      }
    }
  },
  required: ['title', 'description', ...(keywords ? ['keywords'] : []), 'tags']
})

/**
 * Removes "mockup" without leaving a hole: "a clay mockup of an Apple Watch" reads "a clay Apple
 * Watch", "a mockup of a bag" reads "a bag", "tote bag mockup" reads "tote bag".
 */
export function stripMockup(text: string): string {
  return text
    .replace(/\b(a|an|the)\s+mockups?\s+of\s+((a|an|the)\s+)?/gi, (_m, art: string, next?: string) => next ?? `${art} `)
    .replace(/\bmockups?\s+of\s+((a|an|the)\s+)?/gi, '')
    .replace(/\b(a|an|the)\s+mockups?\b/gi, '$1 design')
    .replace(/\s+mockups?\b/gi, '')
    .replace(/\bmockups?\s+/gi, '')
}

function tidySentence(text: string): string {
  const cleaned = stripMockup(stripQuoted(text))
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
  if (cleaned.length <= 200) return cleaned
  const cut = cleaned.slice(0, 199)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:]+$/, '')}…`
}

function clipTitle(text: string): string {
  if (text.length <= 60) return text
  const cut = text.slice(0, 59)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

function tidy(result: EvalResult, keywords: string[] | null): EvalResult {
  const title = clipTitle(stripJunk(result.title) || result.title)
  const seen = new Set<string>()
  const words = (keywords ?? [])
    .map((k) => stripJunk(stripQuoted(k)).toLowerCase())
    .filter((k) => k && !seen.has(k) && seen.add(k))
  return {
    title,
    description: tidySentence(result.description) || result.description,
    tags: result.tags.map((t) => ({ ...t, label: stripJunk(t.label) })).filter((t) => t.label),
    ...(keywords ? { keywords: words } : {})
  }
}

export const makeV6 = (id: string, keywords: boolean, notes: string): PromptVersion => ({
  id,
  notes,
  readImage: readUsableCover,
  buildRequest(input, imageUrl) {
    const content: ChatContentPart[] = []
    if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
    content.push({ type: 'text', text: userText(input, imageUrl !== null, keywords) })
    return {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'mockup', schema: schema(keywords) } },
      temperature: 0.2,
      repeat_penalty: 1.05,
      max_tokens: keywords ? 500 : 400
    }
  },
  parseResult(raw) {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) as { keywords?: string[] }
    return tidy(parseResult(raw), keywords ? (json.keywords ?? []) : null)
  }
})

export default makeV6(
  'v6',
  true,
  "v4 plus keywords that start from the app's own kind words, Angle dropped, v5's quoted-text cut, and the mockup cut without holes."
)
