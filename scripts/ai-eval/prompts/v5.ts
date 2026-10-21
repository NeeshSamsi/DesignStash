import type { AnalysisInput } from '../../../src/shared/inference'
import { parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart } from '../../../src/main/ai/vision-provider'
import type { EvalResult, PromptVersion } from './prompt-version'
import { readUsableCover, stripJunk } from './v3'

/**
 * v5: the first batch from design/research/vlm-prompting-2.md, on top of v4.
 *
 * 1. A `keywords` field for the words a designer would type that the title doesn't hold: the general
 *    category ("packaging", "stationery"), other names, the setting. It is searched, not shown, so the
 *    description can stay one clean sentence (the 7B turned v1's synonym ask into keyword lists).
 * 2. No sample values anywhere, and category lines are definitions with no example labels: the
 *    examples were the label space the models copied from.
 * 3. Post-filters in code: quoted spans and "with the text ..." clauses are cut from the description
 *    (the models quote printed text whatever the prompt says), "mockup" is removed clause by clause
 *    so no holes are left, and `<` and `>` are kept out by the grammar.
 * 4. No Angle: it was wrong about half the time on both models, and no search uses it.
 */

const SYSTEM = `You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English.`

const CATEGORIES: [string, string][] = [
  ['Device', 'a screen device that is in the picture'],
  ['Print & Branding', 'a printed item, sign or piece of packaging'],
  ['Apparel', 'clothing, a bag or other merchandise'],
  ['Environment', 'the setting the object is in'],
  ['Style', 'the look of the picture']
]

const SEEN_LINE =
  '- seen: first, one plain sentence on the main object: what it is, what it is made of and what it rests on. Write the other fields from this.'

function userText(input: AnalysisInput, hasImage: boolean, seen: boolean): string {
  const lines = [
    hasImage ? 'The image above is the mockup preview.' : 'There is no usable preview image, so go by the names below.',
    `File name: ${input.fileName}`
  ]
  if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
  lines.push(
    hasImage
      ? 'The image shows what the mockup is. When it shows the kind of product the names mention, use that product name.'
      : "Describe the object the names point to, in your own words. You can't see the setting, so leave it out.",
    '',
    'Words printed on the object (a brand, a slogan, "mockup", a website on a screen) are template filler a designer replaces. Leave them out of every field and describe the object itself.',
    '',
    `Reply with JSON: ${seen ? 'seen, ' : ''}title, description, keywords, tags.`,
    ...(seen ? [SEEN_LINE] : []),
    '- title: your own short name for the scene, at most 60 characters: the main object, its product name if known, and one detail of the setting.',
    '- description: one natural sentence, at most 200 characters: the main object, what it is made of, where it is, and the main colours.',
    '- keywords: 3 to 8 words or short phrases a designer might type to find this that the title does not already say: the general kind of thing it is, other names people use for the object, and the setting.',
    '- tags: 3 to 5, each one thing that is really in the picture, in its category. Most mockups use only some categories. Labels are one or two plain words.',
    '',
    'Categories:',
    ...CATEGORIES.map(([c, d]) => `- ${c}: ${d}`)
  )
  return lines.join('\n')
}

/** Printable ASCII without `"`, `\`, `<` or `>`. */
const plain = (max: number) => ({ type: 'string', pattern: `^[ !#-;=?-\\[\\]-~]{1,${max}}$` })

const schema = (seen: boolean) => ({
  type: 'object',
  properties: {
    ...(seen ? { seen: plain(300) } : {}),
    title: plain(90),
    description: plain(300),
    keywords: { type: 'array', minItems: 3, maxItems: 8, items: plain(40) },
    tags: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
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
  required: [...(seen ? ['seen'] : []), 'title', 'description', 'keywords', 'tags']
})

/** Cuts the printed text the models quote: "with the text 'X' and 'Y'", then any quoted span left. */
export function stripQuoted(text: string): string {
  return text
    .replace(
      /\s*,?\s*\b(with|featuring|labeled|labelled|reading|that reads|showing|displaying)\s+(the\s+)?(text|words?|label|number|name)?\s*'[^']*'((\s*(,|and)\s*(the\s+)?(text|words?|number)?\s*)'[^']*')*(\s+in\s+(bold\s+)?[a-z]+(\s+(letters|text))?)?(\s+(printed|written)\s+on\s+(it|the\s+\w+))?(\s+on\s+(it|its\s+\w+|the\s+(screen|front|cover)))?/gi,
      ''
    )
    .replace(/\s*'[^']*'/g, '')
}

/** Removes "mockup" a clause at a time, so "a mockup of a bag" reads "a bag" and "tote bag mockup" reads "tote bag". */
export function stripMockup(text: string): string {
  return text
    .replace(/\b(a|an|the)\s+mockups?\s+of\s+/gi, '')
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

function tidy(result: EvalResult, keywords: string[]): EvalResult {
  const title = clipTitle(stripJunk(result.title) || result.title)
  const inTitle = new Set(title.toLowerCase().split(/\W+/))
  const seen = new Set<string>()
  const words = keywords
    .map((k) => stripJunk(k).toLowerCase())
    .filter((k) => k && !k.split(/\W+/).every((w) => inTitle.has(w)) && !seen.has(k) && seen.add(k))
  return {
    title,
    description: tidySentence(result.description) || result.description,
    tags: result.tags.map((t) => ({ ...t, label: stripJunk(t.label) })).filter((t) => t.label),
    keywords: words
  }
}

export const makeV5 = (id: string, seen: boolean): PromptVersion => ({
  id,
  notes: seen
    ? 'v5 with a one-sentence seen field about the main object (on 7B, v3 with seen read the image better than v3b without).'
    : 'v4 plus a searched keywords field, no sample values or example labels, quoted text and "mockup" cut clause by clause, and no Angle.',
  readImage: readUsableCover,
  buildRequest(input, imageUrl) {
    const content: ChatContentPart[] = []
    if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
    content.push({ type: 'text', text: userText(input, imageUrl !== null, seen) })
    return {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'mockup', schema: schema(seen) } },
      temperature: 0.2,
      repeat_penalty: 1.05,
      max_tokens: seen ? 600 : 500
    }
  },
  parseResult(raw) {
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]) as { keywords?: string[]; seen?: string }
    const result = tidy(parseResult(raw), json.keywords ?? [])
    return seen ? { ...result, extra: { seen: json.seen } } : result
  }
})

export default makeV5('v5', false)
