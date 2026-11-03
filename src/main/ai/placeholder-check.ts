import type { InferenceResult } from '../../shared/inference'

/**
 * The reverse two looks (eval ck-9d, design/research/ai-round3.md), for a model that names products
 * from their sample art and loses those names on a masked cover (the 9B). It answers from the cover
 * as it is; then each colour or pattern word in the answer is asked about on the cover with its
 * design slot masked. A "no" means the word only described the placeholder, and the answer is made
 * again from the masked cover, given the first answer less those words.
 */

/** Colour words to check. Grey, white and black are left out: masks and scenes are full of them. */
const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'magenta', 'teal', 'turquoise', 'lime', 'navy', 'lilac', 'lavender', 'gold', 'neon', 'colorful', 'colourful', 'multicolored', 'multicoloured', 'pastel']
/** Pattern and content words to check. */
const PATTERNS = ['grid', 'checkerboard', 'pattern', 'stripes', 'gradient', 'geometric', 'abstract', 'wallpaper', 'interface', 'icons', 'lettering', 'typography', 'logo', 'artwork', 'illustration', 'solar']

const form = (word: string) => String.raw`\b${word}(?:s|ed|y)?\b`

/** The words to check that an answer uses, in list order. */
export function placeholderWordsIn(answer: InferenceResult): string[] {
  const text = [answer.title, answer.description, ...answer.tags.map((t) => t.label)].join(' ').toLowerCase()
  return [...COLOURS, ...PATTERNS].filter((w) => new RegExp(form(w)).test(text))
}

/** The yes/no question for one word, asked about the masked cover. */
export function placeholderQuestion(word: string): string {
  const q = COLOURS.includes(word)
    ? `Is anything in this image ${word === 'colorful' || word === 'colourful' || word.startsWith('multi') ? 'colourful' : word} in colour?`
    : `Is there ${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word} in this image?`
  return `Look only at the image. ${q} Answer yes or no.`
}

/** Text without the given words. */
export function withoutWords(text: string, words: readonly string[]): string {
  return text
    .replace(new RegExp(words.map(form).join('|'), 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim()
}

/**
 * The line the answer made again from the masked cover is given: the first answer less the
 * words, so it keeps the names the first answer read from the sample art. Told only the object's
 * name, the 9B dropped "also called a shop sign" and "Zippo-style" (eval ck-9m against ck-9d).
 */
export function draftLine(answer: InferenceResult, words: readonly string[]): string {
  const tags = answer.tags.map((t) => withoutWords(t.label, words)).filter(Boolean)
  return (
    "A first draft, written from the cover before its design area was blanked out, with the stand-in design's words taken out:\n" +
    `Title: ${withoutWords(answer.title, words)}\nDescription: ${withoutWords(answer.description, words)}\nTags: ${tags.join(', ')}\n` +
    'Keep its names, other names and details where the image agrees, mend any sentence the cuts left broken, and never describe the design area.'
  )
}
