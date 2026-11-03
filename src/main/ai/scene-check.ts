import type { InferenceResult } from '../../shared/inference'

/**
 * The scene-thing check, from the tuning (eval versions ck-2 and ap-6, design/specs/ai.md). Models
 * add things that usually go with the object: an iMac "on a desk" that floats on grey, a mug "next
 * to a plant". After the answer, each thing from this list that it mentions is asked about on the
 * same image as one yes/no question, and a "no" takes it out. Only things that could be placed in or
 * under the scene are listed: attributes ("leather") and adjectives ("floating") misfire.
 */
export const SCENE_THINGS = [
  'desk',
  'table',
  'chair',
  'armchair',
  'sofa',
  'couch',
  'bench',
  'shelf',
  'stool',
  'bed',
  'counter',
  'plate',
  'tray',
  'plant',
  'vase',
  'book',
  'pen',
  'pencil',
  'keyboard',
  'mouse',
  'lamp',
  'hook',
  'hand',
  'wrist',
  'person',
  'woman',
  'man',
  'model'
] as const

/** Below this P(yes) the thing is taken out. Every invented desk on the held-out set scored far under it. */
export const SCENE_CHECK_THRESHOLD = 0.2

/** A thing, singular or plural ("desks", "benches"). */
const plural = (thing: string) => String.raw`${thing}(?:e?s)?\b`

/** The things from `things` an answer mentions, singular or plural, in the list's order. */
export function mentionedThings(answer: InferenceResult, things: readonly string[]): string[] {
  const text = [answer.title, answer.description, ...answer.tags.map((t) => t.label)]
    .join(' ')
    .toLowerCase()
  return things.filter((w) => new RegExp(String.raw`\b${plural(w)}`).test(text))
}

/** The question for one thing. The answer is held to "yes" or "no" by a grammar or a schema. */
export function sceneQuestion(thing: string): string {
  return `Is there ${/^[aeiou]/.test(thing) ? 'an' : 'a'} ${thing} in this image? Answer yes or no.`
}

/**
 * P(yes) from llama-server's logprobs for the one answer token: yes / (yes + no), over every spelling
 * in the top logprobs. Null when neither is there.
 */
export function pYes(logprobs: unknown): number | null {
  const content = (
    logprobs as { content?: { top_logprobs?: { token: string; logprob: number }[] }[] } | undefined
  )?.content
  const top = content?.[0]?.top_logprobs
  if (!top) return null
  const p = (w: string) =>
    top
      .filter((t) => t.token.trim().toLowerCase() === w)
      .reduce((sum, t) => sum + Math.exp(t.logprob), 0)
  const yes = p('yes')
  const no = p('no')
  return yes + no > 0 ? yes / (yes + no) : null
}

/**
 * The answer without a thing the image doesn't have: "resting on a white desk", "on a stack of white
 * books", ", next to a plant", "a desk" in a list, and its tag. The verb that placed the object there
 * goes too, so no "resting" is left hanging. A title that would be left empty stays as it was.
 */
export function withoutThing(answer: InferenceResult, thing: string): InferenceResult {
  const noun = String.raw`(?:(?:stack|pile|heap|set|row|pair|couple) of\s+)?(?:[a-z-]+\s+){0,2}${plural(thing)}`
  const placed = String.raw`(?:(?:resting|standing|sitting|placed|lying|leaning|set|propped|perched|draped)\s+)?`
  const phrase = new RegExp(
    String.raw`[,]?\s*\b${placed}(?:on top of|in front of|next to|on|against|atop|beside|near|under|over|with|and|by)\s+(?:a|an|the|some)?\s*${noun}`,
    'gi'
  )
  const bare = new RegExp(String.raw`\b(?:a|an|the)\s+${noun}`, 'gi')
  const clean = (s: string) =>
    s
      .replace(phrase, '')
      .replace(bare, '')
      .replace(/\s+([,.])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/,\s*\./g, '.')
      .trim()
  return {
    ...answer,
    title: clean(answer.title) || answer.title,
    description: clean(answer.description),
    tags: answer.tags.filter((t) => !new RegExp(String.raw`\b${plural(thing)}`, 'i').test(t.label))
  }
}

/** Said after the request when it is asked again, about the things the check refused. */
export function refusedNote(things: readonly string[]): string {
  const list = things.length > 1 ? `${things.slice(0, -1).join(', ')} or ${things.at(-1)}` : things[0]
  return `Checked against the image: there is no ${list} in it. Do not mention ${things.length > 1 ? 'them' : 'it'}; say what the object really is.`
}

/** A chat request with a line added to the end of its text. */
export function withNote<T extends { messages: { role: string; content: unknown }[] }>(request: T, note: string): T {
  return {
    ...request,
    messages: request.messages.map((m) =>
      m.role === 'user' && Array.isArray(m.content)
        ? {
            ...m,
            content: (m.content as { type: string; text?: string }[]).map((p, i, all) =>
              p.type === 'text' && i === all.map((q) => q.type).lastIndexOf('text') ? { ...p, text: `${p.text}\n\n${note}` } : p
            )
          }
        : m
    )
  }
}
