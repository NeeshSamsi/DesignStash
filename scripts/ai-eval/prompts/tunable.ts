import { RESULT_JSON_SCHEMA, VISION_CATEGORIES } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart, ChatRequest } from '../../../src/main/ai/vision-provider'
import type { AnalysisInput } from '../../../src/shared/inference'

/**
 * The shipped request split into named parts, so a per-model version (`q4-*`, `q9-*`, `ap-*`) can
 * change one part and keep the rest. `SHIPPED` reproduces `buildRequest` exactly (compared request
 * for request when this was written). Not a version itself.
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
  /**
   * The description and tag rules when no image is sent (a placeholder cover). Default: the same as
   * with an image, which asks for the setting and colours the model can't see.
   */
  noImage?: { description: string; tags: string }
  /** Extra lines after the label rule, before the categories. */
  extraRules: string[]
  /** For a pile variant, said after the top's title and description. Default: the app's "Keep the title and tags consistent with it." */
  variantRule?: string
  /** For a pile variant, the lines said in place of the top's title, description and tags (`productOnlyLines`). */
  variantLines?: (group: NonNullable<AnalysisInput['groupContext']>) => string[]
  categories: Record<string, string>
  sampling: Record<string, number>
  maxTokens: number
  schema: object
}

const MIN_TAGS = 3
const MAX_TAGS = 6

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
  tags: `- tags: ${MIN_TAGS} to ${MAX_TAGS}, each one thing that is really in the picture, in its category. Most mockups use only some categories.`,
  labels: '- labels are one or two plain words.',
  extraRules: [],
  categories: VISION_CATEGORIES,
  sampling: { temperature: 0.2, repeat_penalty: 1.05 },
  maxTokens: 450,
  schema: RESULT_JSON_SCHEMA
}

/** A schema copy with a different least number of tags. */
function withMinTags(schema: object, min: number): object {
  const copy = structuredClone(schema) as { properties: { tags: { minItems: number } } }
  copy.properties.tags.minItems = min
  return copy
}

/** The shipped schema with a different tag count. */
/**
 * For a placeholder cover the model has only the names, so the description and tags stick to what
 * the names say. The shipped rules ask for the setting and colours either way, and the models
 * invent them (an iMac "on a clean desk in soft light", a menu "displayed on a screen").
 */
export const NAMES_ONLY = {
  description:
    '- description: one natural sentence, at most 200 characters, about the object the names point to and one or two other words people use for it. Only what the names tell you: no colours, light, setting or surface.',
  tags: '- tags: 1 to 6, only the object and its kind, from the names.'
}

export function schemaWithTags(min: number, max: number): object {
  const schema = structuredClone(RESULT_JSON_SCHEMA) as unknown as {
    properties: { tags: { minItems: number; maxItems: number } }
  }
  schema.properties.tags.minItems = min
  schema.properties.tags.maxItems = max
  return schema
}

export function requestFrom(spec: PromptSpec) {
  return (input: AnalysisInput, imageUrl: string | null): ChatRequest => {
    const hasImage = imageUrl !== null
    const lines: string[] = [hasImage ? spec.imageLine : spec.noImageLine, `File name: ${input.fileName}`]
    if (input.folderTrail.length > 0) lines.push(`Folders: ${input.folderTrail.join(' / ')}`)
    lines.push(hasImage ? spec.namesRule : spec.noImageNamesRule)
    if (input.groupContext && spec.variantLines) {
      const said = spec.variantLines(input.groupContext)
      if (said.length > 0) lines.push('', ...said)
    } else if (input.groupContext) {
      const { originalTitle, originalDescription, originalTags } = input.groupContext
      lines.push(
        '',
        `This is a variant of "${originalTitle}" (${originalDescription}).`,
        `${spec.variantRule ?? 'Keep the title and tags consistent with it.'} Its tags: ${originalTags.map((t) => `${t.category}: ${t.label}`).join(', ') || 'none'}.`
      )
    }
    lines.push(
      '',
      spec.printedRule,
      '',
      'Reply with JSON: title, description, tags.',
      spec.title,
      hasImage || !spec.noImage ? spec.description : spec.noImage.description,
      hasImage || !spec.noImage ? spec.tags : spec.noImage.tags,
      spec.labels,
      ...spec.extraRules,
      '',
      'Categories:',
      ...Object.entries(spec.categories).map(([c, d]) => `- ${c}: ${d}`)
    )
    const content: ChatContentPart[] = []
    if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl } })
    content.push({ type: 'text', text: lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') })
    return {
      messages: [
        { role: 'system', content: spec.system },
        { role: 'user', content }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'mockup', schema: hasImage || !spec.noImage ? spec.schema : withMinTags(spec.schema, 1) }
      },
      ...spec.sampling,
      max_tokens: spec.maxTokens
    } as ChatRequest
  }
}
