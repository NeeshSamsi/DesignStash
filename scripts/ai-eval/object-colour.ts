/**
 * Object-colour mentions (round 4): a colour given to the mockup's object or one of its parts ("a
 * white hoodie", "a mug with a black handle", "leggings in a blue to pink gradient"). The designer
 * changes those in the PSD, so Neesh's rule is to describe no object colours; background, surface
 * and scene colours stay ("on a terracotta backdrop", "a stapler on a white desk"). A colour phrase
 * counts when an object noun follows it within two words, or when it follows an object noun after
 * "in"; one that comes straight after "on", "in", "against" and the like describes the setting.
 */

const COLOUR_WORDS = [
  'white', 'black', 'grey', 'gray', 'silver', 'gold', 'golden', 'red', 'blue', 'navy', 'green', 'yellow', 'orange', 'pink', 'purple', 'violet',
  'brown', 'beige', 'cream-colou?red', 'ivory', 'tan', 'teal', 'turquoise', 'mint', 'olive', 'khaki', 'terracotta', 'coral', 'peach', 'lilac', 'lavender',
  'charcoal', 'amber', 'copper', 'bronze', 'multicolou?red', 'colou?rful', 'gradient', 'space grey', 'space gray', 'rose gold'
]
const SHADES = ['dark', 'light', 'pale', 'bright', 'deep', 'soft', 'neon', 'pastel']
/** One colour, maybe shaded ("dark blue"), and colours joined into one ("red-to-white", "white and violet"). */
const ONE = `(?:(?:${SHADES.join('|')})[\\s-]+)?(?:${COLOUR_WORDS.join('|')})`
const PHRASE = `${ONE}(?:(?:[\\s-]+(?:and|to|or|&)[\\s-]+|,\\s*|-)${ONE})*`

/** The objects mockups show and their parts, singular. Setting words (background, wall, table, base, frame) are left out. */
const OBJECT_NOUNS = [
  'macbook', 'laptop', 'computer', 'imac', 'monitor', 'display', 'phone', 'iphone', 'smartphone', 'ipad', 'tablet', 'keyboard', 'mouse', 'pencil',
  'watch', 'smartwatch', 'band', 'strap', 'speaker', 'case', 'device', 'sticker', 'label', 'poster', 'billboard', 'banner', 'sign', 'signboard',
  'lightbox', 'brochure', 'leaflet', 'flyer', 'card', 'badge', 'lanyard', 'notebook', 'envelope', 'mailer', 'stationery', 'book', 'paperback',
  'cover', 'menu', 'box', 'cube', 'package', 'packaging', 'tube', 'bottle', 'pump', 'dispenser', 'jar', 'lid', 'can', 'cup', 'mug', 'handle',
  'tote', 'bag', 'shopper', 'pouch', 'wrapper', 'bar', 'carton', 'tape', 'roll', 'lighter', 'cap', 'hat', 'hoodie', 'shirt', 't-shirt', 'tee',
  'top', 'leggings', 'tights', 'sweatshirt', 'jumper', 'sweater', 'apron', 'flag', 'sleeve', 'stitching', 'holder'
]
const NOUN = `(?:${OBJECT_NOUNS.join('|')})(?:e?s)?`

const BEFORE = new RegExp(`\\b(${PHRASE})((?:[\\s-]+[a-z0-9'-]+){0,2}?)[\\s-]+${NOUN}\\b`, 'gi')
/**
 * "leggings in a blue to pink gradient", "a cap in navy": the object, at most one word, then "in" a
 * colour that ends the phrase ("in grey smoke" is the smoke's).
 */
const AFTER = new RegExp(`\\b${NOUN}(\\s+[a-z'-]+)?\\s+in\\s+(?:an?\\s+)?${PHRASE}(?:\\s+(?:gradient|colou?r|finish|shade|tone))?\\b(?!\\s+(?!(?:with|and|on|against|in|over|for|from)\\b)[a-z])`, 'gi')
/** A setting word between the colour and the object means the colour is the setting's ("a white desk with stationery"). */
const SETTING_NOUNS = /\b(?:background|backdrop|wall|floor|table|desk|surface|shelf|bench|block|pedestal|plinth|room|ledge|steps?|stone|rock|water|sky|street|sand|tiles?|concrete|wood|plate|tray|base|frame)\b/i
/** A word that puts the object somewhere before "in" ("floating in white", "set in white"). */
const PLACING = /^(?:set|shown|placed|isolated|displayed|seen|\w+ing|\w+ed)$/i
/** Just before a colour phrase, these put it on the setting ("on a small black box"). */
const SETTING = /\b(?:on|onto|in|against|over|above|beside|behind|under|across|atop|upon)\s+(?:(?:a|an|the|its|small|large|big|plain|round|tall|low|wide|long|flat)\s+){0,3}$/i

/** Between fields, so a phrase can't run from one into the next. */
const FIELD_BREAK = ' | '

const tidy = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** The object-colour phrases in one answer: title, description and saved tag labels. */
export function objectColourWords(answer: { title: string; description: string }, savedLabels: string[]): string[] {
  const text = [answer.title, answer.description, ...savedLabels].join(FIELD_BREAK)
  const found: { at: number; words: string }[] = []
  for (const m of text.matchAll(BEFORE)) {
    if (SETTING.test(text.slice(Math.max(0, m.index - 40), m.index)) || SETTING_NOUNS.test(m[2] ?? '')) continue
    found.push({ at: m.index, words: tidy(m[0]) })
  }
  for (const m of text.matchAll(AFTER)) {
    if (m[1] && PLACING.test(m[1].trim())) continue
    found.push({ at: m.index, words: tidy(m[0]) })
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.words)
}

export interface ObjectColourCheck {
  id: string
  repeat: number
  words: string[]
}

export interface ObjectColourSummary {
  answers: number
  /** Share of answers with an object colour. */
  mentioned: number
  /** Object-colour phrases per answer. */
  wordsPerAnswer: number
}

export function summariseObjectColours(checks: ObjectColourCheck[]): ObjectColourSummary {
  const n = checks.length
  return {
    answers: n,
    mentioned: n === 0 ? 0 : checks.filter((c) => c.words.length > 0).length / n,
    wordsPerAnswer: n === 0 ? 0 : checks.reduce((t, c) => t + c.words.length, 0) / n
  }
}
