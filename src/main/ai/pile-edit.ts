import type { PileEdit, PileEditEntry } from '../../shared/inference'

/**
 * A person's edit to a pile top, carried to its variants (design/specs/look-over.md, L7; round 3 C,
 * design/research/ai-round3.md). Code finds the words the edit added and took out. A model that
 * judges pile edits (the 9B) is asked whether what was added is true of each variant's cover, and
 * accepting works the change into the variant's own description in a text request. These are the
 * words `scripts/ai-eval/edit-carry.ts` measures (versions c4 and accept).
 */

export const PILE_EDIT_SYSTEM =
  "You help keep a designer's mockup library consistent. A pile holds variants of one mockup (other angles, colours or scenes). You decide whether an edit the designer made to the first mockup's catalogue entry should also go to another mockup in the pile. Write in English."

const STOP = new Set(['the', 'and', 'with', 'also', 'called', 'its', 'for', 'one', 'two', 'three', 'that', 'whose', 'which', 'from', 'into', 'onto', 'this'])
const contentWords = (text: string) =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2 && !STOP.has(w)))

/** The content words an edit added and took out, over its description and tags. */
export function editDiff(e: PileEdit): { added: string[]; removed: string[] } {
  const before = contentWords([e.before.description, ...e.before.tags].join(' '))
  const after = contentWords([e.after.description, ...e.after.tags].join(' '))
  return { added: [...after].filter((w) => !before.has(w)), removed: [...before].filter((w) => !after.has(w)) }
}

const editLines = (e: PileEdit) => [
  'The designer edited the catalogue entry of the first mockup in a pile.',
  `Before: "${e.before.description}" Tags: ${e.before.tags.join(', ')}.`,
  `After: "${e.after.description}" Tags: ${e.after.tags.join(', ')}.`
]

/** Asked with the variant's cover: is what the edit added true of it, and on a no, why. */
export function checkPrompt(e: PileEdit, added: string[]): string {
  return [
    'The image above is another mockup in the pile.',
    ...editLines(e),
    `The edit added: ${added.join(', ')}.`,
    '',
    'Is what the edit added also true of this image (the same surface, setting, colour, state, name or detail)? Answer yes or no from what the image shows.',
    'Reply with JSON: answer, reason. The reason is a few words on what this image shows instead, starting with "this one" (for a photo of a bike: "this one shows the bike from behind"), or empty when the answer is yes.'
  ].join('\n')
}

/** The variant's entry with the edit's change made, and nothing else. */
export function changePrompt(e: PileEdit, entry: PileEditEntry): string {
  return [
    ...editLines(e),
    '',
    `Another mockup in the pile has this entry: "${entry.description}" Tags: ${entry.tags.join(', ')}.`,
    'Make the same change to that entry and nothing else: keep its own setting, angle and other details, and its own words where the edit did not touch them.',
    'Reply with JSON: description, tags.'
  ].join('\n')
}

/** The variant's entry with the words an edit took out taken out too. */
export function removePrompt(removed: string[], entry: PileEditEntry): string {
  return [
    `The designer took these words out of the first mockup's entry in a pile, because they were wrong: ${removed.join(', ')}.`,
    `Another mockup in the pile has this entry: "${entry.description}" Tags: ${entry.tags.join(', ')}.`,
    'Take the same thing out of that entry and change nothing else. Mend any sentence the cut leaves broken.',
    'Reply with JSON: description, tags.'
  ].join('\n')
}

/** Whether an edit has anything for this entry: it added words, or the entry has words it took out. */
export function editReaches(e: PileEdit, entry: PileEditEntry): boolean {
  const { added, removed } = editDiff(e)
  if (added.length > 0) return true
  const text = [entry.description, ...entry.tags].join(' ')
  return removed.some((w) => new RegExp(`\\b${w}`, 'i').test(text))
}

/**
 * The text request that works an edit into a variant's entry, or null when there is nothing to
 * change: the edit only took words out, and the entry has none of them.
 */
export function rewritePrompt(e: PileEdit, entry: PileEditEntry): string | null {
  if (!editReaches(e, entry)) return null
  const { added, removed } = editDiff(e)
  return added.length > 0 ? changePrompt(e, entry) : removePrompt(removed, entry)
}

export const CHECK_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', enum: ['yes', 'no'] }, reason: { type: 'string' } },
  required: ['answer', 'reason']
}

export const ENTRY_SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' }, maxItems: 8 } },
  required: ['description', 'tags']
}

/** A pile-edit request for llama-server: greedy, with the cover first when there is one. */
export function pileEditRequest(text: string, schema: object, imageUrl: string | null = null): object {
  return {
    messages: [
      { role: 'system', content: PILE_EDIT_SYSTEM },
      { role: 'user', content: [...(imageUrl ? [{ type: 'image_url', image_url: { url: imageUrl } }] : []), { type: 'text', text }] }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'carry', schema } },
    temperature: 0,
    max_tokens: 400,
    seed: 42
  }
}

/** A check's reply. Anything but a clean yes or no throws, so the caller offers the edit. */
export function readCheck(text: string): { answer: 'yes' | 'no'; reason: string } {
  const parsed = JSON.parse(text) as { answer?: unknown; reason?: unknown }
  if (parsed.answer !== 'yes' && parsed.answer !== 'no') throw new Error('No yes or no in the check')
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().replace(/[.\s]+$/, '') : ''
  return { answer: parsed.answer, reason: parsed.answer === 'no' ? reason : '' }
}

/** A rewrite's description. An empty one throws, so the caller falls back to a copy. */
export function readRewrite(text: string): string {
  const description = (JSON.parse(text) as { description?: unknown }).description
  if (typeof description !== 'string' || description.trim() === '') throw new Error('No description in the rewrite')
  return description.trim()
}
