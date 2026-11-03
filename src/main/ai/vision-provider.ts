import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import type { InferenceProvider, AnalysisInput, InferenceResult } from '../../shared/inference'
import { InferenceResultSchema } from '../../shared/inference'
import { normaliseTagLabel } from '../../shared/tags'

/**
 * The categories a tag can go in, with what each covers. They are the seed categories in
 * `db/bootstrap.ts`: `snapTags` matches the category exactly, so the schema limits the model to
 * these. Labels are left to the model: listing the seed labels made the small models copy
 * the list instead of looking at the image (see design/specs/ai.md).
 */
export const VISION_CATEGORIES: Record<string, string> = {
  Device: 'the screen device the design is shown on, like a laptop, phone, tablet or monitor',
  'Print & Branding': 'printed or packaged items, like a poster, business card, box, bag or label',
  Apparel: 'clothing and merchandise, like a t-shirt, cap, tote bag or mug',
  Environment: 'the setting, like indoor, outdoor, desk scene, flat lay or hand-held',
  Style: 'the look, like minimal, realistic, 3d render, dark or colorful',
  Angle: 'the camera angle: front, side, angle or top-down'
}

const CATEGORIES = Object.keys(VISION_CATEGORIES)
const MAX_TAGS = 6
const TITLE_MAX = 60
const DESCRIPTION_MAX = 200
/** Longest edge of the image sent to the model. Bigger costs prompt time without better tags. */
export const VISION_IMAGE_MAX_EDGE = 1024

/** JSON schema the runtime constrains the reply to: `{title, description, tags:[{category,label}]}`. */
export const RESULT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', maxLength: TITLE_MAX },
    description: { type: 'string', maxLength: DESCRIPTION_MAX },
    tags: {
      type: 'array',
      minItems: 1,
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
  max_tokens: number
}

export interface VisionProviderDeps {
  /** Send one chat request and return the reply text. */
  complete(request: ChatRequest): Promise<string>
  /** The cover as a data URL the runtime can decode, or null when there isn't one to read. */
  readImage(path: string): Promise<string | null>
  /** Release the runtime (stop the server). */
  dispose?(): Promise<void>
}

const SYSTEM_PROMPT = `You catalogue design mockups (PSD templates) for a designer's library. You look at the mockup's preview image and say what it shows: the object or device the design is placed on, the scene, the style and the camera angle. Ignore watermarks, stock-site logos and placeholder text.`

function contextText(input: AnalysisInput, hasImage: boolean): string {
  const lines: string[] = []
  lines.push(
    hasImage
      ? 'The image above is the mockup preview. Describe what it shows.'
      : 'There is no preview image for this mockup, so go by the names below.'
  )
  lines.push('', `File name: ${input.fileName}`)
  if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
  if (hasImage)
    lines.push(
      'The file name and folders are hints. When they disagree with the image, trust the image.'
    )

  if (input.groupContext) {
    const { originalTitle, originalDescription, originalTags } = input.groupContext
    lines.push(
      '',
      `This is a variant of "${originalTitle}" (${originalDescription}).`,
      `Keep the title and tags consistent with it. Its tags: ${originalTags.map((t) => `${t.category}: ${t.label}`).join(', ') || 'none'}.`
    )
  }

  const categories = CATEGORIES.map((c) => `- ${c}: ${VISION_CATEGORIES[c]}`).join('\n')
  lines.push(
    '',
    'Reply with JSON only:',
    `- title: what this mockup shows, at most ${TITLE_MAX} characters. Name the object and the setting, for example "Phone held over a cafe table" or "Coffee cup, top-down".`,
    `- description: one sentence saying more than the title, at most ${DESCRIPTION_MAX} characters.`,
    `- tags: 3 to ${MAX_TAGS} tags. Each tag is one thing you can see in this mockup, put in the category it belongs to. Never tag something that isn't there.`,
    '- Each label is a short name in plain words, like "iPhone", "Tote bag" or "Flat lay".',
    '',
    'Categories:',
    categories
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
    max_tokens: 400
  }
}

/** A label as the model wrote it, trimmed. Snapping to the seed labels ("iphone" → "iPhone") is `snapTags`' job. */
function toLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

function toCategory(raw: string): string {
  const trimmed = raw.trim()
  return CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/** Parse and tidy the reply: valid shape, trimmed text, no duplicate tags ("iPhone" and "iphone" are one). */
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
    if (!category || !label || seen.has(key)) continue
    seen.add(key)
    tags.push({ category, label })
  }

  const title = clip(validated.data.title, TITLE_MAX)
  if (!title) throw new Error('Model response has an empty title')
  return {
    title,
    description: clip(validated.data.description, DESCRIPTION_MAX),
    tags: tags.slice(0, MAX_TAGS)
  }
}

/**
 * Reads a cover for the model: scaled to fit `VISION_IMAGE_MAX_EDGE` and re-encoded as JPEG,
 * which every llama.cpp build decodes. Covers are stored as 2048px WebP; the smaller image
 * needs about a third of the prompt tokens (see design/specs/ai.md). Null when the cover is
 * missing or unreadable, so the mockup is still described from its names.
 */
export async function readCoverAsDataUrl(path: string): Promise<string | null> {
  if (!path) return null
  try {
    const jpeg = await sharp(await readFile(path))
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
 * Inference provider for a vision model (GGUF + mmproj) behind llama.cpp. It shows the model
 * the mockup's cover first, with the file name and folder trail as secondary text, and asks
 * for a JSON reply constrained by `RESULT_JSON_SCHEMA`. The transport is injected: the
 * provider factory wires it to a `LlamaServer`; tests pass a stub.
 */
export class VisionInferenceProvider implements InferenceProvider {
  readonly id = 'vision'

  constructor(
    readonly name: string,
    private readonly deps: VisionProviderDeps
  ) {}

  async analyze(input: AnalysisInput): Promise<InferenceResult> {
    const imageUrl = await this.deps.readImage(input.imagePath)
    const reply = await this.deps.complete(buildRequest(input, imageUrl))
    return parseResult(reply)
  }

  async dispose(): Promise<void> {
    await this.deps.dispose?.()
  }
}
