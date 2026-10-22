import { parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart, ChatRequest } from '../../../src/main/ai/vision-provider'
import type { AnalyzeContext, EvalResult, PromptVersion } from './prompt-version'
import { NAMES_ONLY, SHIPPED, requestFrom } from './tunable'

/**
 * The check pass, step 2: after the main answer, one yes/no question per claim about the scene, on
 * the same cover (llama-server reuses the image from its cache), reading P(yes) from the answer
 * token's logprobs. Claims are the non-Style tags, what the object rests on or stands against, and
 * material words. This version only records P(yes) per claim in `extra.checks`; the answer itself is
 * unchanged, so the run shows whether P(yes) separates invented claims from real ones.
 */
const build = requestFrom({ ...SHIPPED, noImage: NAMES_ONLY })

const MATERIALS = ['leather', 'wooden', 'wood', 'metal', 'metallic', 'glass', 'concrete', 'marble', 'stone', 'velvet', 'fabric', 'paper', 'plastic', 'ceramic', 'flexible', 'solar', 'glowing', 'illuminated']
const SETTING = /\b(?:on|against|atop|beside|in front of|on top of|under)\s+(?:a|an|the)\s+((?:[a-z-]+\s+){0,2}[a-z-]+)/gi

export function claimsOf(answer: EvalResult): string[] {
  const claims = new Set<string>()
  for (const t of answer.tags) if (t.category !== 'Style') claims.add(t.label.toLowerCase())
  const text = `${answer.title}. ${answer.description}`
  for (const m of text.matchAll(SETTING)) claims.add(m[1]!.toLowerCase())
  for (const w of MATERIALS) {
    const m = text.match(new RegExp(String.raw`\b${w}\s+([a-z-]+)`, 'i'))
    if (m) claims.add(`${w} ${m[1]!.toLowerCase()}`)
  }
  return [...claims]
}

function question(base: ChatRequest, claim: string): object {
  const user = base.messages[1]!.content as ChatContentPart[]
  const image = user.filter((p) => p.type === 'image_url')
  return {
    messages: [
      base.messages[0],
      { role: 'user', content: [...image, { type: 'text', text: `Look only at the image. Is there ${/^[aeiou]/.test(claim) ? 'an' : 'a'} ${claim} in this image? Answer yes or no.` }] }
    ],
    grammar: 'root ::= "yes" | "no"',
    temperature: 0,
    max_tokens: 1,
    logprobs: true,
    top_logprobs: 5
  }
}

function pYes(logprobs: unknown): number | null {
  const content = (logprobs as { content?: { top_logprobs?: { token: string; logprob: number }[] }[] })?.content
  const top = content?.[0]?.top_logprobs
  if (!top) return null
  const p = (w: string) => top.filter((t) => t.token.trim().toLowerCase() === w).reduce((s, t) => s + Math.exp(t.logprob), 0)
  const yes = p('yes'), no = p('no')
  return yes + no > 0 ? yes / (yes + no) : null
}

const version: PromptVersion = {
  id: 'ck-1',
  notes: 'q9-2 answer, then one cached yes/no question per scene claim; records P(yes) only.',
  buildRequest: build,
  parseResult,
  async analyze(ctx: AnalyzeContext) {
    const request = build(ctx.input, ctx.imageUrl)
    const answer = parseResult((await ctx.chat(request)).raw)
    if (!ctx.imageUrl) return answer
    const checks: Record<string, number | null> = {}
    for (const claim of claimsOf(answer)) checks[claim] = pYes((await ctx.chat(question(request, claim))).logprobs)
    return { ...answer, extra: { checks } }
  }
}

export default version
