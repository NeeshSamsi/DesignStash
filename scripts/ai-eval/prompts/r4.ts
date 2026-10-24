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
export interface R4Options {
  id: string
  notes: string
  /** Lines of the shipped request, each swapped for its replacement wherever it appears. */
  swap: [from: string, to: string][]
}

/** The shipped request's text with the swaps made. */
function swapped(request: ChatRequest, swap: R4Options['swap']): ChatRequest {
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
      const profile: PromptProfile = { ...shipped, buildRequest: (input, imageUrl) => swapped(shipped.buildRequest(input, imageUrl), options.swap) }
      if (model === 'apple') {
        helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 })
        return new AppleInferenceProvider({ prompt: profile, helper }).analyze(ctx.input)
      }
      const provider = new VisionInferenceProvider(model, {
        prompt: profile,
        complete: async (request) => {
          const reply = await ctx.chat(request)
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
export const COLOUR_SWAPS: R4Options['swap'] = [
  [SHIPPED.title, R4_TITLE],
  [SHIPPED.description, R4_DESCRIPTION],
  [SHIPPED.printedRule, `${SHIPPED.printedRule}\n${COLOUR_RULE}`]
]
