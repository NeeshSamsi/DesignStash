import { parseResult } from '../../../src/main/ai/vision-provider'
import type { ChatContentPart, ChatRequest } from '../../../src/main/ai/vision-provider'
import type { AnalyzeContext, EvalResult, PromptVersion } from './prompt-version'
import { NAMES_ONLY, SHIPPED, requestFrom } from './tunable'

/**
 * The check pass, step 3. ck-1 showed a cached yes/no question catches objects the model adds to the
 * scene because they usually go together (an iMac "on a desk" that floats on grey: P(yes) 0.0000001),
 * misses attributes it believes ("leather" for velvet), and misfires on adjectives ("Is there a
 * floating"). So only things that could be placed in or under the scene are checked, from a fixed
 * list, and a "no" (P(yes) under 0.2) takes the phrase out of the title, description and tags.
 */
const build = requestFrom({ ...SHIPPED, noImage: NAMES_ONLY })

/** Things a model adds because they usually go with the object: furniture, surfaces, props, people. */
const SCENE_THINGS = ['desk', 'table', 'chair', 'armchair', 'sofa', 'couch', 'bench', 'shelf', 'stool', 'bed', 'counter', 'plate', 'tray', 'plant', 'vase', 'book', 'pen', 'pencil', 'keyboard', 'mouse', 'lamp', 'hook', 'hand', 'wrist', 'person', 'woman', 'man', 'model']
const THRESHOLD = 0.2

function mentioned(answer: EvalResult): string[] {
  const text = [answer.title, answer.description, ...answer.tags.map((t) => t.label)].join(' ').toLowerCase()
  return SCENE_THINGS.filter((w) => new RegExp(String.raw`\b${w}s?\b`).test(text))
}

function question(base: ChatRequest, thing: string): object {
  const user = base.messages[1]!.content as ChatContentPart[]
  return {
    messages: [
      base.messages[0],
      {
        role: 'user',
        content: [
          ...user.filter((p) => p.type === 'image_url'),
          { type: 'text', text: `Look only at the image. Is there ${/^[aeiou]/.test(thing) ? 'an' : 'a'} ${thing} in this image? Answer yes or no.` }
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

export function pYes(logprobs: unknown): number | null {
  const content = (logprobs as { content?: { top_logprobs?: { token: string; logprob: number }[] }[] })?.content
  const top = content?.[0]?.top_logprobs
  if (!top) return null
  const p = (w: string) => top.filter((t) => t.token.trim().toLowerCase() === w).reduce((s, t) => s + Math.exp(t.logprob), 0)
  const yes = p('yes')
  const no = p('no')
  return yes + no > 0 ? yes / (yes + no) : null
}

/** Takes a refused thing out: "on a white desk", ", next to a plant", "a desk" in a list, its tag. */
export function withoutThing(answer: EvalResult, thing: string): EvalResult {
  const noun = String.raw`(?:[a-z-]+\s+){0,2}${thing}s?\b`
  const phrase = new RegExp(String.raw`[,]?\s*\b(?:on|against|atop|beside|near|next to|in front of|on top of|under|with|and|by)\s+(?:a|an|the|some)?\s*${noun}`, 'gi')
  const bare = new RegExp(String.raw`\b(?:a|an|the)\s+${noun}`, 'gi')
  const clean = (s: string) =>
    s.replace(phrase, '').replace(bare, '').replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').replace(/,\s*\./g, '.').trim()
  return {
    ...answer,
    title: clean(answer.title),
    description: clean(answer.description),
    tags: answer.tags.filter((t) => !new RegExp(String.raw`\b${thing}s?\b`, 'i').test(t.label))
  }
}

const version: PromptVersion = {
  id: 'ck-2',
  notes: 'q9-2 answer, then a cached yes/no question per scene thing from a fixed list; a "no" removes it.',
  buildRequest: build,
  parseResult,
  async analyze(ctx: AnalyzeContext) {
    const request = build(ctx.input, ctx.imageUrl)
    let answer = parseResult((await ctx.chat(request)).raw)
    if (!ctx.imageUrl) return answer
    const checks: Record<string, number | null> = {}
    for (const thing of mentioned(answer)) {
      const p = pYes((await ctx.chat(question(request, thing))).logprobs)
      checks[thing] = p
      if (p !== null && p < THRESHOLD) answer = withoutThing(answer, thing)
    }
    return { ...answer, extra: { checks } }
  }
}

export default version
