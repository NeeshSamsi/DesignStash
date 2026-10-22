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
  /** Extra lines after the label rule, before the categories. */
  extraRules: string[]
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

export function requestFrom(spec: PromptSpec) {
  return (input: AnalysisInput, imageUrl: string | null): ChatRequest => {
    const hasImage = imageUrl !== null
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
    lines.push(
      '',
      spec.printedRule,
      '',
      'Reply with JSON: title, description, tags.',
      spec.title,
      spec.description,
      spec.tags,
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
      response_format: { type: 'json_schema', json_schema: { name: 'mockup', schema: spec.schema } },
      ...spec.sampling,
      max_tokens: spec.maxTokens
    } as ChatRequest
  }
}
