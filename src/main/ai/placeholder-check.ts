import type { InferenceResult } from '../../shared/inference'

/**
 * The reverse two looks (eval ck-9m, design/research/ai-round3.md), for a model that names products
 * from their sample art and loses those names on a masked cover (the 9B). It answers from the cover
 * as it is; then each colour or pattern word in the answer is asked about on the cover with its
 * design slot masked. A "no" means the word only described the placeholder, and the answer is made
 * again from the masked cover, told the object's name from the first title less those words.
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

/** A title without the given words, for the object's name. */
export function withoutWords(title: string, words: readonly string[]): string {
  return title
    .replace(new RegExp(words.map(form).join('|'), 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
