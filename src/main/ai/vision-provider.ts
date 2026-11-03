import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import type { InferenceProvider, AnalysisInput, InferenceResult } from '../../shared/inference'
import { InferenceResultSchema } from '../../shared/inference'
import { normaliseTagLabel } from '../../shared/tags'
import type { PromptProfile } from './prompts/profile'
import { isPlaceholder } from '../psd/placeholder'
import {
  SCENE_CHECK_THRESHOLD,
  mentionedThings,
  pYes,
  sceneQuestion,
  withoutThing
} from './scene-check'

/**
 * The categories the model tags in, with what each covers: the seed categories in `db/bootstrap.ts`
 * (`snapTags` matches the category exactly, so the schema limits the model to these). Each line has a
 * few example labels, not the seed list, which the small models copied in order.
 *
 * The model is still asked for an Angle, but `parseResult` drops it, so it is never suggested: both
 * models got the camera angle wrong about half the time, and no search uses it. Taking the Angle
 * line out of the prompt changed the 7B's whole answer for the worse (70% to 63% of searches found,
 * three passes each), so the request stays as tuned (see design/specs/ai.md).
 */
export const VISION_CATEGORIES: Record<string, string> = {
  Device: 'screen devices: laptop, MacBook, phone, iPhone, tablet, monitor, smartwatch, TV',
  'Print & Branding':
    'printed things and packaging: business card, poster, billboard, sign, box, packaging, label, book, stationery, envelope',
  Apparel: 'clothing and merchandise: t-shirt, hoodie, cap, tote bag, mug, sticker',
  Environment: 'the setting: indoor, outdoor, street, desk, floor, wall, water, floating',
  Style: 'the look: minimal, realistic, 3D render, clay, dark, colorful',
  Angle:
    'front (camera level with the object), side (profile), angle (three-quarter view from above), top-down (looking straight down)'
}

/** Tags in this category are asked for but never suggested; see `VISION_CATEGORIES`. */
const UNSUGGESTED_CATEGORY = 'Angle'

const CATEGORIES = Object.keys(VISION_CATEGORIES)
const MIN_TAGS = 3
const MAX_TAGS = 6
const TITLE_MAX = 60
const DESCRIPTION_MAX = 200
/** Longest edge of the image sent to the model. Bigger costs prompt time without better tags. */
export const VISION_IMAGE_MAX_EDGE = 1024

/**
 * A string the grammar keeps to printable ASCII without `"` or `\\`. The 3B leaked Chinese
 * characters into English descriptions; this rules them out at the source. The limit is looser than
 * the saved length, because a hard cut ends a sentence mid-word; `parseResult` trims at a word.
 */
const plainText = (max: number) =>
  ({ type: 'string', pattern: `^[ !#-\\[\\]-~]{1,${max}}$` }) as const

/** JSON schema the runtime constrains the reply to: `{title, description, tags:[{category,label}]}`. */
export const RESULT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: plainText(90),
    description: plainText(300),
    tags: {
      type: 'array',
      minItems: MIN_TAGS,
      maxItems: MAX_TAGS,
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          label: { type: 'string' }
        },
        required: ['category', 'label']
      }
    }
  },
  required: ['title', 'description', 'tags']
} as const

export type ChatContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string }

/** An OpenAI-compatible chat completion request, as llama-server takes it. */
export interface ChatRequest {
  messages: { role: 'system' | 'user'; content: string | ChatContentPart[] }[]
  response_format: { type: 'json_schema'; json_schema: { name: string; schema: object } }
  temperature: number
  /** Qwen's own generation config uses 1.05; llama-server's default is off. */
  repeat_penalty: number
  max_tokens: number
  /** The rest of llama-server's sampling settings, for a model's tuned prompt profile. */
  top_p?: number
  top_k?: number
  min_p?: number
  presence_penalty?: number
  seed?: number
}

/** One chat completion's reply: its text, and the logprobs when the request asked for them. */
export interface ChatReply {
  text: string
  logprobs?: unknown
}

export interface VisionProviderDeps {
  /** The model's own prompt: how it is asked and how its reply is read. */
  prompt: PromptProfile
  /** Send one chat request (an answer, or a scene-thing question) and return the reply. */
  complete(request: object): Promise<ChatReply>
  /** The cover as a data URL the runtime can decode, or null when there isn't one to read. */
  readImage(path: string): Promise<string | null>
  /** Release the runtime (stop the server). */
  dispose?(): Promise<void>
}

const SYSTEM_PROMPT = `You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English.`

/**
 * The per-mockup instructions, tuned on the test set (design/specs/ai.md, "Prompt"). The only worked
 * examples describe a bicycle: the small models copy whatever examples they are shown into their
 * answers, so the examples come from outside the library, where a copy is harmless and easy to spot.
 */
function contextText(input: AnalysisInput, hasImage: boolean): string {
  const lines: string[] = [
    hasImage
      ? 'The image above is the mockup preview.'
      : 'There is no usable preview image, so go by the names below.',
    `File name: ${input.fileName}`
  ]
  if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
  lines.push(
    hasImage
      ? 'The image shows what the mockup is. When it shows the kind of product the names mention (a MacBook, an iPhone 16, an Apple Watch Ultra), use that product name.'
      : "Describe the object the names point to, in your own words. You can't see the setting, so leave it out."
  )

  if (input.groupContext) {
    const { originalTitle, originalDescription, originalTags } = input.groupContext
    lines.push(
      '',
      `This is a variant of "${originalTitle}" (${originalDescription}).`,
      `Keep the title and tags consistent with it. Its tags: ${originalTags.map((t) => `${t.category}: ${t.label}`).join(', ') || 'none'}.`
    )
  }

  lines.push(
    '',
    'Words printed on the object (a brand, a slogan, "mockup", a website on a screen) are template filler a designer replaces. Leave them out of every field and describe the object itself.',
    '',
    'Reply with JSON: title, description, tags.',
    `- title: your own short name for the scene, at most ${TITLE_MAX} characters: the main object, its product name if known, and one detail of the setting. For a photo of a bike it would be "Red road bike against a garage door".`,
    `- description: one natural sentence, at most ${DESCRIPTION_MAX} characters. Name the main object and, in the same sentence, one or two other words people use for it, then the setting and the main colours. For the bike: "A red road bike, also called a racing bicycle, leaning on a white garage door in afternoon sun."`,
    `- tags: ${MIN_TAGS} to ${MAX_TAGS}, each one thing that is really in the picture, in its category. Most mockups use only some categories.`,
    '- labels are one or two plain words.',
    '',
    'Categories:',
    ...CATEGORIES.map((c) => `- ${c}: ${VISION_CATEGORIES[c]}`)
  )
  return lines.join('\n')
}

/** The request for one mockup: the image first, then the file name and folders as secondary text. */
export function buildRequest(input: AnalysisInput, imageUrl: string | null): ChatRequest {
  const content: ChatContentPart[] = []
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
  content.push({ type: 'text', text: contextText(input, imageUrl !== null) })

  return {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'mockup', schema: RESULT_JSON_SCHEMA }
    },
    temperature: 0.2,
    repeat_penalty: 1.05,
    max_tokens: 450
  }
}

/**
 * Words every file in a mockup library shares, plus the stock sites they come from. They match every
 * search, so they say nothing; the models copy them from file names and from text printed on covers.
 */
export const JUNK_WORDS = /\b(free|mockups?|psd|templates?|pixeden|pixelbuddha|freepik|mockupfree|ls\.?graphics)\b/gi

/** Takes the junk words out of a title or label and tidies what's left. */
function stripJunk(text: string): string {
  return tidySpacing(text.replace(JUNK_WORDS, ''))
}

/** A quoted span: a quote at the start of a word, closed before a space or punctuation. Possessives never match. */
const QUOTED = String.raw`'[^']+'(?=[\s,.;:!?]|$)`

/**
 * The printed text the models quote, whatever the prompt says (Qwen 2.5 VL is trained hard on
 * reading text), cut with the words that introduce and follow it: "labeled 'SNACKBAR' with the number
 * '1' in orange" goes as one piece, so no "with the number in orange" is left behind.
 */
const QUOTED_CLAUSE = new RegExp(
  String.raw`\s*,?\s*\b(with|featuring|labeled|labelled|reading|reads|that reads|showing|displaying|including)\s+` +
    String.raw`((a|an|the)\s+)?([a-z-]+\s+){0,2}?((text|words?|label|number|name)\s+)?${QUOTED}` +
    String.raw`(\s*(,|and|with)\s*((the\s+)?(text|words?|number)\s+)?${QUOTED})*` +
    String.raw`(\s+(text|words?|label|printed on it|on it|on the \w+|in ((bright|dark|light|pale|deep|bold|large|small|big)\s+)?[a-z]+(\s+(letters|text))?))*`,
  'gi'
)

function stripQuoted(text: string): string {
  return text.replace(QUOTED_CLAUSE, '').replace(new RegExp(String.raw`(^|\s)${QUOTED}`, 'g'), '$1')
}

/** Words that describe a mockup's look, so "a vibrant mockup featuring" reads "a vibrant design featuring". */
const LOOK_WORDS = 'vibrant|minimalist|minimal|sleek|clean|modern|colorful|colourful|realistic|detailed|simple|professional|stylish'

/** Removes "mockup" a phrase at a time: "a clay mockup of an Apple Watch" reads "a clay Apple Watch". */
function stripMockup(text: string): string {
  return text
    .replace(/\b(a|the)\s+free\s+/gi, '$1 ')
    .replace(new RegExp(String.raw`\b(${LOOK_WORDS})\s+mockups?\b(?!\s+of\b)`, 'gi'), '$1 design')
    .replace(/\b(a|an|the)\s+mockups?\s+of\s+((a|an|the)\s+)?/gi, (_m, art: string, next?: string) => next ?? `${art} `)
    .replace(/\bmockups?\s+of\s+((a|an|the)\s+)?/gi, '')
    .replace(/\b(a|an|the)\s+mockups?\b/gi, '$1 design')
    .replace(/\s+mockups?\b/gi, '')
    .replace(/\bmockups?\s+/gi, '')
}

function tidySpacing(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '')
    .trim()
}

/** A title or description starts with a capital, even after its first words were cut; iPhone stays iPhone. */
function sentence(text: string): string {
  return tidySpacing(text).replace(/^[a-z](?![A-Z])/, (c) => c.toUpperCase())
}

/** A sentence whose only news is the printed text ("The text around the sticker reads 'X'"). */
const PRINTED_TEXT_SENTENCE = new RegExp(String.raw`^[^.]*\b(text|words?|label|reads?|says)\b[^.]*${QUOTED}[^.]*\.?$`, 'i')

function dropPrintedTextSentences(text: string): string {
  return text
    .split(/(?<=\.)\s+/)
    .filter((s) => !PRINTED_TEXT_SENTENCE.test(s) || !/^the\s+(text|words?|label)/i.test(s))
    .join(' ')
}

/** A label as the model wrote it, trimmed. Snapping to the seed labels ("iphone" → "iPhone") is `snapTags`' job. */
function toLabel(raw: string): string {
  return stripJunk(raw)
}

function toCategory(raw: string): string {
  const trimmed = raw.trim()
  return CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
}

/** Shortens text to `max` characters at a word, with an ellipsis. */
function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`
}

/** Parse and tidy the reply: valid shape, clean text, no duplicate tags ("iPhone" and "iphone" are one). */
export function parseResult(raw: string): InferenceResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON found in model response: ${raw.slice(0, 120)}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error(`Invalid JSON in model response: ${match[0].slice(0, 120)}`)
  }
  const validated = InferenceResultSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Model response did not match schema: ${validated.error.message}`)
  }

  const seen = new Set<string>()
  const tags: InferenceResult['tags'] = []
  for (const tag of validated.data.tags) {
    const category = toCategory(tag.category)
    const label = toLabel(tag.label)
    const key = `${normaliseTagLabel(category)}\u0000${normaliseTagLabel(label)}`
    if (!category || !label || category === UNSUGGESTED_CATEGORY || seen.has(key)) continue
    seen.add(key)
    tags.push({ category, label })
  }

  const rawTitle = validated.data.title.trim()
  if (!rawTitle) throw new Error('Model response has an empty title')
  const title = clip(sentence(stripJunk(stripQuoted(rawTitle))) || rawTitle, TITLE_MAX)
  const description = sentence(
    stripMockup(stripQuoted(dropPrintedTextSentences(validated.data.description)))
  )
  return {
    title,
    description: clip(description || validated.data.description, DESCRIPTION_MAX),
    tags: tags.slice(0, MAX_TAGS)
  }
}

export { PLACEHOLDER_ENTROPY } from '../psd/placeholder'

/**
 * Reads a cover for the model: scaled to fit `VISION_IMAGE_MAX_EDGE` and re-encoded as JPEG,
 * which every llama.cpp build decodes. Covers are stored as 2048px WebP; the smaller image
 * needs about a third of the prompt tokens (see design/specs/ai.md). Null when the cover is
 * missing, unreadable or a near-blank placeholder, so the mockup is described from its names:
 * shown a "Remove this layer to start" notice, both models described the notice.
 */
export async function readCoverAsDataUrl(path: string): Promise<string | null> {
  if (!path) return null
  try {
    const bytes = await readFile(path)
    if (await isPlaceholder(bytes)) return null
    const jpeg = await sharp(bytes)
      .resize(VISION_IMAGE_MAX_EDGE, VISION_IMAGE_MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * One scene-thing question on the answer's own image (llama-server reuses it from its cache): one
 * greedy token held to "yes" or "no", with logprobs, so `pYes` can read how sure the model is.
 */
function sceneThingRequest(answerRequest: ChatRequest, thing: string): object {
  const [system, user] = answerRequest.messages
  const image = (user!.content as ChatContentPart[]).filter((p) => p.type === 'image_url')
  return {
    messages: [
      system,
      { role: 'user', content: [...image, { type: 'text', text: `Look only at the image. ${sceneQuestion(thing)}` }] }
    ],
    grammar: 'root ::= "yes" | "no"',
    temperature: 0,
    max_tokens: 1,
    logprobs: true,
    top_logprobs: 5
  }
}

/**
 * Inference provider for a vision model (GGUF + mmproj) behind llama.cpp. It shows the model
 * the mockup's cover first, with the file name and folder trail as secondary text, and asks
 * in the words of the model's prompt profile (a JSON reply constrained by its schema). When the
 * cover was shown, each scene thing the answer mentions is then checked (`scene-check.ts`). The
 * transport is injected: the provider factory wires it to a `LlamaServer`; tests pass a stub.
 */
export class VisionInferenceProvider implements InferenceProvider {
  readonly id = 'vision'

  constructor(
    readonly name: string,
    private readonly deps: VisionProviderDeps
  ) {}

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    const imageUrl = await this.deps.readImage(input.imagePath)
    const request = this.deps.prompt.buildRequest(input, imageUrl)
    let answer = this.deps.prompt.parseResult((await this.deps.complete(request)).text)
    if (!imageUrl) return answer
    for (const thing of mentionedThings(answer, this.deps.prompt.sceneThings ?? [])) {
      const p = await this.deps
        .complete(sceneThingRequest(request, thing))
        .then((reply) => pYes(reply.logprobs))
        // A check that fails says nothing about the thing, so it stays.
        .catch(() => null)
      if (p !== null && p < SCENE_CHECK_THRESHOLD) answer = withoutThing(answer, thing)
    }
    return answer
  }

  async dispose(): Promise<void> {
    await this.deps.dispose?.()
  }
}
