import type { AnalysisInput } from '../../../shared/inference'
import {
  RESULT_JSON_SCHEMA,
  VISION_CATEGORIES,
  type ChatContentPart,
  type ChatRequest
} from '../vision-provider'

/**
 * A chat request split into named parts, so a model's profile can change one part and keep the rest.
 * Ported from the eval's `tunable.ts`, where each change was measured. `SHIPPED` rebuilds
 * `buildRequest` in vision-provider exactly (a test compares them).
 */
export interface PromptSpec {
  system: string
  imageLine: string
  noImageLine: string
  /** After the file name and folders, when there is an image. */
  namesRule: string
  noImageNamesRule: string
  printedRule: string
  title: string
  description: string
  tags: string
  labels: string
  /** The description and tag rules when no image is sent (a placeholder cover). Default: as with an image. */
  noImage?: { description: string; tags: string }
  /** Said after the printed-words rule when the image has its design slot painted over (`MASK_RULE`). */
  maskRule?: string
  categories: Record<string, string>
  sampling: { temperature: number; repeat_penalty: number }
  maxTokens: number
  schema: object
}

export const SHIPPED: PromptSpec = {
  system:
    "You write the catalogue entry for one design mockup in a designer's library. A designer finds it later by typing a few plain words into a search box, so the words you choose decide whether it can be found. Write in English.",
  imageLine: 'The image above is the mockup preview.',
  noImageLine: 'There is no usable preview image, so go by the names below.',
  namesRule:
    'The image shows what the mockup is. When it shows the kind of product the names mention (a MacBook, an iPhone 16, an Apple Watch Ultra), use that product name.',
  noImageNamesRule:
    "Describe the object the names point to, in your own words. You can't see the setting, so leave it out.",
  printedRule:
    'Words printed on the object (a brand, a slogan, "mockup", a website on a screen) are template filler a designer replaces. Leave them out of every field and describe the object itself.',
  title:
    '- title: your own short name for the scene, at most 60 characters: the main object, its product name if known, and one detail of the setting. For a photo of a bike it would be "Red road bike against a garage door".',
  description:
    '- description: one natural sentence, at most 200 characters. Name the main object and, in the same sentence, one or two other words people use for it, then the setting and the main colours. For the bike: "A red road bike, also called a racing bicycle, leaning on a white garage door in afternoon sun."',
  tags: '- tags: 3 to 6, each one thing that is really in the picture, in its category. Most mockups use only some categories.',
  labels: '- labels are one or two plain words.',
  categories: VISION_CATEGORIES,
  sampling: { temperature: 0.2, repeat_penalty: 1.05 },
  maxTokens: 450,
  schema: RESULT_JSON_SCHEMA
}

/**
 * For a placeholder cover the model has only the names, so the description and tags stick to what
 * the names say. With the shipped rules the models invented a setting and colours (an iMac "on a
 * clean desk in soft light", a menu "displayed on a screen").
 */
export const NAMES_ONLY = {
  description:
    '- description: one natural sentence, at most 200 characters, about the object the names point to and one or two other words people use for it. Only what the names tell you: no colours, light, setting or surface.',
  tags: '- tags: 1 to 6, only the object and its kind, from the names.'
}

/**
 * For a cover shown with its design slot painted over (eval ck-5lr): what the grey area is, so the
 * model calls it a screen, label or print and never an object or a colour of its own.
 */
export const MASK_RULE =
  'The screen, label or print area where the designer puts their own work has been blanked out in the image: it shows as a flat or blurred grey area, or one marked DESIGN AREA. That area is not an object and has no colour or pattern of its own. Call it the screen, label or print of the object it is on, and never describe what is on it.'

/** A schema copy that allows as few as `min` tags. */
function withMinTags(schema: object, min: number): object {
  const copy = structuredClone(schema) as { properties: { tags: { minItems: number } } }
  copy.properties.tags.minItems = min
  return copy
}

/** The request builder for a spec: the image first, then the names and the rules. */
export function requestFrom(spec: PromptSpec) {
  return (input: AnalysisInput, imageUrl: string | null): ChatRequest => {
    const hasImage = imageUrl !== null
    const namesOnly = !hasImage && spec.noImage ? spec.noImage : null
    const lines: string[] = [hasImage ? spec.imageLine : spec.noImageLine, `File name: ${input.fileName}`]
    if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
    lines.push(hasImage ? spec.namesRule : spec.noImageNamesRule)
    if (input.groupContext) {
      const { originalTitle, originalDescription, originalTags } = input.groupContext
      lines.push(
        '',
        `This is a variant of "${originalTitle}" (${originalDescription}).`,
        `Keep the title and tags consistent with it. Its tags: ${originalTags.map((t) => `${t.category}: ${t.label}`).join(', ') || 'none'}.`
      )
    }
    lines.push('', spec.printedRule)
    if (hasImage && input.slotMasked && spec.maskRule) lines.push(spec.maskRule)
    lines.push(
      '',
      'Reply with JSON: title, description, tags.',
      spec.title,
      namesOnly ? namesOnly.description : spec.description,
      namesOnly ? namesOnly.tags : spec.tags,
      spec.labels,
      '',
      'Categories:',
      ...Object.entries(spec.categories).map(([c, d]) => `- ${c}: ${d}`)
    )
    const content: ChatContentPart[] = []
    if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
    content.push({ type: 'text', text: lines.join('\n') })
    return {
      messages: [
        { role: 'system', content: spec.system },
        { role: 'user', content }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'mockup', schema: namesOnly ? withMinTags(spec.schema, 1) : spec.schema }
      },
      ...spec.sampling,
      max_tokens: spec.maxTokens
    }
  }
}
