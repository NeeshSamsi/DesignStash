import { NativeHelper, resolveHelperPath } from '../../../src/main/native/helper'
import { parseResult, readCoverAsDataUrl } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart, ChatRequest } from '../../../src/main/ai/vision-provider'
import { appleVersion } from './apple-runtime'
import { mentioned as ck2Mentioned, pYes, THRESHOLD, withoutThing as ck2Without } from './ck-2'
import { maskedCoverPath, type MaskStyle } from './masked'
import type { AnalyzeContext, EvalResult, PromptVersion } from './prompt-version'
import { NAMES_ONLY, SHIPPED, requestFrom, type PromptSpec } from './tunable'

/**
 * Round 3, experiment A: keep the placeholder (the design slot's stand-in content) out of the
 * answer, and catch invented surfaces. Builders for the `ck-3*` (Qwen) and `ap-7*` (Apple)
 * versions; not a version itself.
 *
 * - mask: the model sees the cover with its design slot painted over (`masked.ts`).
 * - rule: one more prompt rule, after the printed-words rule.
 * - things: the scene-thing list the check asks about; `withoutThing` here also takes out a
 *   "stack of" or "pile of" in front of the thing.
 */

/** Said after the printed-words rule. */
export const PLACEHOLDER_RULE =
  'The screen, label or print area where the designer puts their own work shows a stand-in until they do: a grid, a checkerboard, a flat grey or colour fill, sample text, an app screen or sample art. Leave that stand-in out of every field. Do not describe what it shows or its colours; only say the object has a screen, label or print.'

/** ck-2 and ap-6's list. */
export const CK2_THINGS = ['desk', 'table', 'chair', 'armchair', 'sofa', 'couch', 'bench', 'shelf', 'stool', 'bed', 'counter', 'plate', 'tray', 'plant', 'vase', 'book', 'pen', 'pencil', 'keyboard', 'mouse', 'lamp', 'hook', 'hand', 'wrist', 'person', 'woman', 'man', 'model']

/** Surfaces and stands a model puts under a floating or resting object. */
export const SURFACE_THINGS = ['pedestal', 'plinth', 'podium', 'box', 'crate', 'cube', 'block', 'stand', 'rock', 'stone', 'step', 'ledge', 'platform']

export function mentionedIn(answer: EvalResult, things: string[]): string[] {
  const text = [answer.title, answer.description, ...answer.tags.map((t) => t.label)].join(' ').toLowerCase()
  return things.filter((w) => new RegExp(String.raw`\b${w}(?:e?s)?\b`).test(text))
}

/** ck-2's `withoutThing`, plus a quantifier ("a stack of white books") in front of the thing. */
export function withoutThing(answer: EvalResult, thing: string): EvalResult {
  const noun = String.raw`(?:(?:stack|pile|set|row|pair|couple|heap) of\s+)?(?:[a-z-]+\s+){0,2}${thing}(?:e?s)?\b`
  // "resting on a desk" goes as a whole, so no "resting" is left hanging.
  const lead = String.raw`(?:(?:resting|standing|sitting|placed|lying|leaning|set|propped|draped|perched|displayed|shown)\s+)?`
  const phrase = new RegExp(String.raw`[,]?\s*\b${lead}(?:on|against|atop|beside|near|next to|in front of|on top of|under|with|and|by|over)\s+(?:a|an|the|some)?\s*${noun}`, 'gi')
  const bare = new RegExp(String.raw`\b(?:a|an|the)\s+${noun}`, 'gi')
  const clean = (s: string) =>
    s.replace(phrase, '').replace(bare, '').replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*\./g, '.').trim()
  return {
    ...answer,
    title: clean(answer.title),
    description: clean(answer.description),
    tags: answer.tags.filter((t) => !new RegExp(String.raw`\b${thing}(?:e?s)?\b`, 'i').test(t.label))
  }
}

const article = (thing: string) => (/^[aeiou]/.test(thing) ? 'an' : 'a')

function question(base: ChatRequest, thing: string): object {
  const user = base.messages[1]!.content as ChatContentPart[]
  return {
    messages: [
      base.messages[0],
      {
        role: 'user',
        content: [
          ...user.filter((p) => p.type === 'image_url'),
          { type: 'text', text: `Look only at the image. Is there ${article(thing)} ${thing} in this image? Answer yes or no.` }
        ]
      }
    ],
    grammar: 'root ::= "yes" | "no"',
    temperature: 0,
    max_tokens: 1,
    logprobs: true,
    top_logprobs: 5
  }
}

export interface R3Options {
  id: string
  notes: string
  mask?: MaskStyle
  rule?: boolean
  /** A wider scene-thing list, with the -es plurals and "stack of" removal. Default: ck-2's check exactly. */
  things?: string[]
  /** Reword the line a pile variant gets after its top's words (`PromptSpec.variantRule`). */
  variantRule?: string
  /** Leave out the bad "also called" names (Apple). */
  alternates?: boolean
}

function checker(opts: R3Options) {
  const things = opts.things
  return things
    ? { mentioned: (a: EvalResult) => mentionedIn(a, things), without: withoutThing }
    : { mentioned: ck2Mentioned, without: ck2Without }
}

/** The description rule with the other names held to real names for the same object. */
export const ALTERNATES_RULE =
  ' The other words must be real names for the same kind of object that someone would search for (a tote for a shopping bag, a smartphone for an iPhone). Never a broader word such as design, product, prop, mockup, container, device, computer or website; if there is no real other name, leave it out.'

function specFor(base: PromptSpec, opts: R3Options): PromptSpec {
  let spec = opts.rule ? { ...base, printedRule: `${base.printedRule}\n${PLACEHOLDER_RULE}` } : base
  if (opts.variantRule) spec = { ...spec, variantRule: opts.variantRule }
  if (opts.alternates) spec = { ...spec, description: spec.description + ALTERNATES_RULE }
  return spec
}

/** A Qwen version: ck-2 (q9-2's answer, then the scene-thing check) with the options. */
export function qwenR3(opts: R3Options): PromptVersion {
  const build = requestFrom(specFor({ ...SHIPPED, noImage: NAMES_ONLY }, opts))
  const check = checker(opts)
  const mask = opts.mask
  return {
    id: opts.id,
    notes: opts.notes,
    buildRequest: build,
    parseResult,
    ...(mask && { readImage: async (path: string) => readCoverAsDataUrl(await maskedCoverPath(path, mask)) }),
    async analyze(ctx: AnalyzeContext) {
      const request = build(ctx.input, ctx.imageUrl)
      let answer = parseResult((await ctx.chat(request)).raw)
      if (!ctx.imageUrl) return answer
      const checks: Record<string, number | null> = {}
      for (const thing of check.mentioned(answer)) {
        const p = pYes((await ctx.chat(question(request, thing))).logprobs)
        checks[thing] = p
        if (p !== null && p < THRESHOLD) answer = check.without(answer, thing)
      }
      return { ...answer, extra: { checks } }
    }
  }
}

let helper: NativeHelper | null = null
const sharedHelper = () => (helper ??= new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 3_000 }))

/** ap-5's names rule, from ap-5.ts. */
const AP5_NAMES_RULE =
  'The image shows what the mockup is. The names often say what kind of mockup it is or the product it shows (a long scroll website, a mailer box, an iPhone 16, an Apple Watch Ultra). When the image fits, use those words.'

/** An Apple version: ap-6 (ap-5's answer, then a yes/no check per scene thing) with the options. */
export function appleR3(opts: R3Options): PromptVersion {
  const spec = specFor({ ...SHIPPED, namesRule: AP5_NAMES_RULE, noImage: NAMES_ONLY }, opts)
  const inner = appleVersion({ id: opts.id, notes: opts.notes, buildRequest: requestFrom(spec), parseResult })
  const check = checker(opts)
  const mask = opts.mask
  return {
    ...inner,
    async analyze(ctx: AnalyzeContext) {
      const imagePath = mask && ctx.imageUrl ? await maskedCoverPath(ctx.input.imagePath, mask) : ctx.input.imagePath
      const c = { ...ctx, input: { ...ctx.input, imagePath } }
      let answer = await inner.analyze!(c)
      if (!ctx.imageUrl) return answer
      const checks: Record<string, string> = {}
      for (const thing of check.mentioned(answer)) {
        const reply = await sharedHelper().describe({
          imagePath,
          instructions: 'You answer questions about one image, looking only at the image.',
          prompt: `Is there ${article(thing)} ${thing} in this image? Answer yes or no.`,
          schema: { type: 'object', properties: { answer: { type: 'string', enum: ['yes', 'no'] } }, required: ['answer'] },
          maxTokens: 10
        })
        const said = (JSON.parse(reply.text) as { answer: string }).answer
        checks[thing] = said
        if (said === 'no') answer = check.without(answer, thing)
      }
      return { ...answer, extra: { ...answer.extra, checks } }
    }
  }
}
