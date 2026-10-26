import { AppleInferenceProvider } from '../../../src/main/ai/apple-provider'
import { promptProfile } from '../../../src/main/ai/prompts'
import type { PromptProfile } from '../../../src/main/ai/prompts/profile'
import { SHIPPED } from '../../../src/main/ai/prompts/request'
import { VisionInferenceProvider, readCoverAsDataUrl, type ChatContentPart, type ChatRequest } from '../../../src/main/ai/vision-provider'
import { NativeHelper, resolveHelperPath } from '../../../src/main/native/helper'
import { argValue } from '../eval-files'
import type { AnalyzeContext, AnalyzeVersion } from './prompt-version'

/**
 * Round 4 (design/research/ai-round4.md): the app's own provider and the `--model`'s shipped profile,
 * as `app` runs them, with lines of the built request swapped. Everything else (masks, the object
 * name, the scene check, redo, the 9B's colour check) is exactly what ships.
 */
/** Lines of the shipped request, each swapped for its replacement wherever it appears. */
export type Swaps = [from: string, to: string][]

export interface R4Options {
  id: string
  notes: string
  swap?: Swaps
  /**
   * Every request on its way to the model, changed (round 4's 4B speed candidates). `memo` lasts for
   * one mockup: the answer's image is kept there for a check that wants it.
   */
  transform?: (request: Record<string, unknown>, memo: { answerImage?: string }) => Record<string, unknown> | Promise<Record<string, unknown>>
  /** Asked about after the answer as the shipped scene things are, and redone and cut the same way on a "no". */
  moreSceneThings?: readonly string[]
}

/** The shipped request's text with the swaps made. */
function swapped(request: ChatRequest, swap: Swaps): ChatRequest {
  const [system, user] = request.messages
  const content = (user!.content as ChatContentPart[]).map((part) =>
    part.type === 'text' ? { ...part, text: swap.reduce((t, [from, to]) => t.split(from).join(to), part.text) } : part
  )
  return { ...request, messages: [system!, { ...user!, content }] }
}

export function appR4(options: R4Options): AnalyzeVersion {
  const model = argValue('model') ?? ''
  const shipped = promptProfile(model)
  let helper: NativeHelper | null = null
  return {
    id: options.id,
    notes: `${options.notes} (the app's provider and the ${model} profile)`,
    ...(model === 'apple' && { runtime: 'external' as const }),
    async analyze(ctx: AnalyzeContext) {
      if (!shipped) throw new Error(`No app prompt profile for ${model}`)
      const swap = options.swap ?? []
      const profile: PromptProfile = {
        ...shipped,
        buildRequest: (input, imageUrl) => swapped(shipped.buildRequest(input, imageUrl), swap),
        ...(options.moreSceneThings && { sceneThings: [...(shipped.sceneThings ?? []), ...options.moreSceneThings] })
      }
      const memo: { answerImage?: string } = {}
      if (model === 'apple') {
        helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 })
        return new AppleInferenceProvider({ prompt: profile, helper }).analyze(ctx.input)
      }
      const provider = new VisionInferenceProvider(model, {
        prompt: profile,
        complete: async (request) => {
          const sent = options.transform ? await options.transform(request as Record<string, unknown>, memo) : request
          const reply = await ctx.chat(sent)
          return { text: reply.raw, logprobs: reply.logprobs }
        },
        readImage: readCoverAsDataUrl
      })
      return provider.analyze(ctx.input)
    }
  }
}

/** The colour rule (Neesh, 2026-10-24): the object gets no colour; the setting keeps its colours. */
export const COLOUR_RULE =
  'The designer sets the colours of the object itself (its body, fabric, finish, print and parts) in the mockup file, so give the object no colour in any field: write "a road bike" and never "a red road bike". The colours of the background, surfaces and things around it help people find it, so keep those.'

export const R4_TITLE =
  '- title: your own short name for the scene, at most 60 characters: the main object, its product name if known, and one detail of the setting. For a photo of a bike it would be "Road bike against a white garage door".'

export const R4_DESCRIPTION =
  '- description: one natural sentence, at most 200 characters. Name the main object and, in the same sentence, one or two other words people use for it, then the setting and its colours. For the bike: "A road bike, also called a racing bicycle, leaning on a white garage door in afternoon sun."'

/** The swaps for the colour rule: both bike examples lose the bike's colour, and the rule follows the printed-words rule. */
export const COLOUR_SWAPS: Swaps = [
  [SHIPPED.title, R4_TITLE],
  [SHIPPED.description, R4_DESCRIPTION],
  [SHIPPED.printedRule, `${SHIPPED.printedRule}\n${COLOUR_RULE}`]
]

type Message = { role: string; content: string | ChatContentPart[] }

/** Which of the 4B's requests this is: the object hint, the answer, or a yes/no check. */
export function requestKind(request: Record<string, unknown>): 'hint' | 'answer' | 'check' | 'other' {
  const messages = request.messages as Message[]
  if (messages[0]?.content === 'You name the object a design mockup shows.') return 'hint'
  if (typeof request.grammar === 'string' && request.grammar.includes('"yes"')) return 'check'
  const format = request.response_format as { json_schema?: { name?: string } } | undefined
  return format?.json_schema?.name === 'mockup' ? 'answer' : 'other'
}

/** The request's image, or undefined. */
export function imageOf(request: Record<string, unknown>): string | undefined {
  const user = (request.messages as Message[]).find((m) => m.role === 'user')
  const part = Array.isArray(user?.content) ? user.content.find((p) => p.type === 'image_url') : undefined
  return part?.type === 'image_url' ? part.image_url.url : undefined
}

/** The request with its image swapped. */
export function withImage(request: Record<string, unknown>, url: string): Record<string, unknown> {
  const messages = (request.messages as Message[]).map((m) =>
    m.role === 'user' && Array.isArray(m.content)
      ? { ...m, content: m.content.map((p) => (p.type === 'image_url' ? { ...p, image_url: { url } } : p)) }
      : m
  )
  return { ...request, messages }
}

/** A data-URL image scaled to fit `edge` pixels, as a JPEG data URL. */
export async function smaller(url: string, edge: number): Promise<string> {
  const { default: sharp } = await import('sharp')
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
  const jpeg = await sharp(bytes).resize(edge, edge, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/**
 * Round 4's 512 px hint experiments: the object hint on the cover scaled to `hintEdge` px, with its
 * question swapped for `hintText` when given, and the scene checks on the cover scaled to 512 px.
 * The 4B's profile scales its checks to 512 px itself now (`checkEdge`, with the same function), so
 * a check that already fits is left as it is.
 */
export function smallerHint(hintEdge: number, hintText?: string): NonNullable<R4Options['transform']> {
  return async (request) => {
    const kind = requestKind(request)
    const url = imageOf(request)
    if (!url || (kind !== 'hint' && kind !== 'check')) return request
    if (kind === 'check' && (await fits(url, 512))) return request
    const resized = withImage(request, await smaller(url, kind === 'hint' ? hintEdge : 512))
    return kind === 'hint' && hintText ? withHintText(resized, hintText) : resized
  }
}

/** Whether a data-URL image already fits in `edge` pixels. */
async function fits(url: string, edge: number): Promise<boolean> {
  const { default: sharp } = await import('sharp')
  const { width = 0, height = 0 } = await sharp(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')).metadata()
  return Math.max(width, height) <= edge
}

/** The hint request asking `text`, with room for a longer name. */
function withHintText(request: Record<string, unknown>, text: string): Record<string, unknown> {
  const messages = (request.messages as Message[]).map((m) =>
    m.role === 'user' && Array.isArray(m.content) ? { ...m, content: m.content.map((p) => (p.type === 'text' ? { ...p, text } : p)) } : m
  )
  const format = structuredClone(request.response_format) as { json_schema: { schema: { properties: { object: { maxLength: number } } } } }
  format.json_schema.schema.properties.object.maxLength = 60
  return { ...request, messages, response_format: format, max_tokens: 40 }
}
