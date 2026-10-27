// A pile's base title and each mockup's variation (design/specs/pile-titles.md, "Base title and
// variations"). Pure and shared: main writes the variations, the renderer shows them.
import { z } from 'zod'

/**
 * Where a variation came from. The app's words (`ai`, `marker`, `number`) may be rewritten when a
 * pile changes; `typed` words are the person's and are never changed.
 */
export const VariationSourceSchema = z.enum(['ai', 'marker', 'number', 'typed'])
export type VariationSource = z.infer<typeof VariationSourceSchema>

/** A mockup's variation in a pile: its words as written, and where they came from. */
export const VariationSchema = z.object({ words: z.string().min(1), source: VariationSourceSchema })
export type Variation = z.infer<typeof VariationSchema>

/** What joins the base and the variation in a full title. */
export const TITLE_DOT = ' · '

/** A mockup's full title: `base · variation` in a pile, its own title on its own. */
export function fullTitle(base: string, variation: Pick<Variation, 'words'> | null): string {
  return variation ? `${base}${TITLE_DOT}${variation.words}` : base
}

/** A variation shown on its own (a card title, the sidebar heading) starts with a capital: "Side view". */
export function variationHeading(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Words as stored: trimmed, with runs of spaces folded. */
export function tidyWords(words: string): string {
  return words.trim().replace(/\s+/g, ' ')
}

const SAME = /^\s*(?:same|the same|none|no difference|identical|n\/a|nothing)?\s*$/i

/** A model's answer that tells nothing apart ("same", "no difference", or nothing at all). */
export function saysSame(said: string): boolean {
  return SAME.test(said)
}

/** Cyrillic and Greek letters drawn like Latin ones, each above the Latin letter it passes for. */
const LOOKS = '\u0410\u0412\u0415\u041a\u041c\u041d\u041e\u0420\u0421\u0422\u0425\u0423\u0405\u0406\u0408\u0430\u0435\u043e\u0440\u0441\u0443\u0445\u0455\u0456\u0458\u04bb\u0501\u0391\u0392\u0395\u0396\u0397\u0399\u039a\u039c\u039d\u039f\u03a1\u03a4\u03a5\u03a7\u03bf'
const LIKE = 'ABEKMHOPCTXYSIJaeopcyxsijhdABEZHIKMNOPTYXo'
const LATIN_FOR = new Map([...LOOKS].map((c, i) => [c, LIKE[i]!]))

/**
 * A name with the Cyrillic and Greek letters that look Latin written as the Latin ones, where the
 * name is Latin: "Сlay" (a Cyrillic С, as some marketplaces' files have) becomes "Clay", so a search
 * for "clay" finds it (F-077). Only a word whose every Cyrillic or Greek letter has a Latin twin is
 * rewritten, so a word in Cyrillic or Greek ("Москва", "Αθήνα") stays as written, and so does a
 * name with no Latin letters.
 */
export function latinLookalikes(name: string): string {
  if (!/\p{Script=Latin}/u.test(name)) return name
  return name.replace(/\p{L}+/gu, (word) => {
    const latin = [...word].map((c) => LATIN_FOR.get(c) ?? c).join('')
    return /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(latin) ? word : latin
  })
}

/**
 * The fallback when the model can't tell, for each file in a pile: the short part of its name the
 * others don't share ("A" in tote-a, "2" in mug-2, "EU" in notebook_EU, "clay" in "Watch - Clay").
 * A letter, a number up to two digits or a word up to 12 letters; long numbers and codes like
 * "M003T1513" aren't markers. When the names give none, or two would get the same one, every mockup
 * gets its number in the pile. Proved on round 4's piles (design/research/ai-round4.md, B5).
 */
export function fileMarkers(fileNames: string[]): string[] {
  return ownMarkers(fileNames) ?? fileNames.map((_, i) => String(i + 1))
}

/** `fileMarkers` with where each came from, for a pile's files in pile order (top first). */
export function fallbackVariations(fileNames: string[]): Variation[] {
  const markers = ownMarkers(fileNames)
  return markers
    ? markers.map((words) => ({ words, source: 'marker' }))
    : fileNames.map((_, i) => ({ words: String(i + 1), source: 'number' }))
}

/** Each file's own marker, or null when one has none or two share one. */
function ownMarkers(fileNames: string[]): string[] | null {
  const words = fileNames.map((n) => latinLookalikes(n).replace(/\.[^.]+$/, '').split(/[-_\s.,()]+/).filter(Boolean))
  const markers = words.map((mine, i) => {
    const others = words.filter((_, j) => j !== i)
    const own = mine.filter((w, k) => others.every((o) => o[k] !== w) && /^(?:\p{L}{1,12}|\d{1,2})$/u.test(w))
    if (own.length !== 1) return null
    const word = own[0]!
    return word.length === 1 || word === word.toUpperCase() ? word.toUpperCase() : word.toLowerCase()
  })
  const unique = markers.every((m) => m !== null) && new Set(markers).size === markers.length
  return unique ? (markers as string[]) : null
}

const sameKey = (words: string) => tidyWords(words).toLowerCase()

/**
 * Words the app is writing into a pile, numbered where another mockup already has them: the first
 * in pile order keeps them and the next gets a number ("side", "side 2", "side 3"). `kept` are the
 * words already in the pile that stay as they are (typed, or written before); `landing` are the
 * app's new words in pile order. The number is added once, as the words land.
 */
export function numberRepeats(kept: string[], landing: string[]): string[] {
  const taken = new Set(kept.map(sameKey))
  return landing.map((words) => {
    let out = words
    for (let n = 2; taken.has(sameKey(out)); n++) out = `${words} ${n}`
    taken.add(sameKey(out))
    return out
  })
}
