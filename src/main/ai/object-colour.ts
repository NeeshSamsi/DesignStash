/**
 * Object colours (design/research/ai-round4.md): a colour given to the mockup's object or one of its
 * parts ("a white hoodie", "a mug with a black handle", "leggings in a blue to pink gradient"). The
 * designer changes those in the PSD, so suggestions describe none (Neesh, 2026-10-24); background,
 * surface and scene colours stay ("on a terracotta backdrop", "a stapler on a white desk"). A colour
 * phrase counts when an object noun follows it within three words, or when it follows an object noun
 * after "in"; one that comes straight after "on", "in", "against" and the like describes the
 * setting. Every model's answer goes through `withoutObjectColours`, and the eval counts with
 * `objectColourWords`, so the two never disagree.
 */

export const COLOUR_WORDS = [
  'white', 'black', 'grey', 'gray', 'silver', 'gold', 'golden', 'red', 'blue', 'navy', 'green', 'yellow', 'orange', 'pink', 'purple', 'violet',
  'brown', 'beige', 'cream-colou?red', 'ivory', 'tan', 'teal', 'turquoise', 'mint', 'olive', 'khaki', 'terracotta', 'coral', 'peach', 'lilac', 'lavender',
  'charcoal', 'amber', 'copper', 'bronze', 'lime', 'magenta', 'cyan', 'maroon', 'burgundy', 'mustard', 'emerald', 'scarlet', 'crimson', 'aqua',
  'indigo', 'fuchsia', 'ochre', 'plum', 'salmon', 'mauve', 'multicolou?red', 'colou?red', 'colou?rful', 'gradient', 'ombre', 'space grey', 'space gray',
  'rose gold', 'dark'
]
const SHADES = ['dark', 'light', 'pale', 'bright', 'brightly', 'deep', 'soft', 'neon', 'pastel']
/**
 * One colour, maybe shaded by a word or another colour ("dark blue", "lime green"), and colours
 * joined into one ("red-to-white", "white and violet").
 */
const ONE = `(?:(?:${[...SHADES, ...COLOUR_WORDS].join('|')})[\\s-]+)?(?:${COLOUR_WORDS.join('|')})`
const PHRASE = `${ONE}(?:(?:[\\s-]+(?:and|to|or|&)[\\s-]+|,\\s*|-)${ONE})*`

/** The objects mockups show and their parts, singular. Setting words (background, wall, table, base, frame) are left out. */
const OBJECT_NOUNS = [
  'macbook', 'laptop', 'computer', 'imac', 'monitor', 'display', 'phone', 'iphone', 'smartphone', 'ipad', 'tablet', 'keyboard', 'mouse', 'pencil',
  'watch', 'smartwatch', 'band', 'strap', 'speaker', 'case', 'device', 'sticker', 'label', 'poster', 'billboard', 'banner', 'sign', 'signboard',
  'lightbox', 'brochure', 'leaflet', 'flyer', 'card', 'badge', 'lanyard', 'notebook', 'envelope', 'mailer', 'stationery', 'book', 'paperback',
  'cover', 'menu', 'box', 'cube', 'package', 'packaging', 'tube', 'bottle', 'pump', 'dispenser', 'jar', 'lid', 'can', 'cup', 'mug', 'handle',
  'tote', 'bag', 'shopper', 'pouch', 'wrapper', 'bar', 'carton', 'tape', 'roll', 'lighter', 'cap', 'hat', 'hoodie', 'shirt', 't-shirt', 'tee',
  'top', 'leggings', 'tights', 'sweatshirt', 'jumper', 'sweater', 'apron', 'flag', 'sleeve', 'stitching', 'holder', 'clasp', 'rim', 'interior',
  'zip', 'zipper', 'cord', 'core', 'brim', 'closure', 'homepod', 'text', 'lettering'
]
const NOUN = `(?:${OBJECT_NOUNS.join('|')})(?:e?s)?`

/** Setting words, and words that end a noun phrase ("with", "and", "of"): never between a colour and its object. */
const STOP = `(?:background|backdrop|wall|floor|table|desk|surface|shelf|bench|block|pedestal|plinth|room|ledge|steps?|stone|rock|water|sky|street|sand|tiles?|concrete|wood|plate|tray|base|frame|with|and|or|of|on|in|at|by|for|from|to|beside|near|against|around|among|behind|under|over|a|an|the|its|their)`
const BETWEEN = `(?!${STOP}\\b)[a-z0-9'-]+`
const BEFORE = new RegExp(`\\b(${PHRASE})((?:[\\s-]+${BETWEEN}){0,3}?)[\\s-]+${NOUN}\\b`, 'gi')
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

/**
 * A colour finish ("with a silver finish", "and red and white gradient finish"), taken out with the
 * word that joined it on. Before "and" only the finish goes ("with a silver finish and black edges"
 * keeps "with black edges"). A finish that isn't a colour ("a matte finish") isn't one.
 */
const FINISH = new RegExp(
  `(^|\\|\\s*|,?\\s+(?:with|featuring|and)\\s+)(an?\\s+)?((?:(?:matte|glossy|metallic|sleek|shiny|smooth|brushed|polished)\\s+)?${PHRASE}(?:\\s+gradient)?\\s+finish)\\b(\\s+and\\s+)?`,
  'gi'
)
/** Furniture a finish belongs to when it comes straight before ("a wooden table with a white finish"). */
const FURNITURE = /\b(?:table|desk|counter|shelf|floor|wall|bench|cabinet|worktop)\s*$/i
/** A colour given to "one" ("including a lime green one"): the colour and its article go, and "one" stays. */
const PRONOUN = new RegExp(`\\b(an?\\s+)(${PHRASE})\\s+(ones?)\\b`, 'gi')

/**
 * A gradient of colours given to the object, after it: "with a blue to purple color gradient", or
 * "displayed in a gradient of blue and purple". It goes whole, with the word that joined it on. A
 * gradient that names no colour ("against a soft gradient background") is the setting's.
 */
const GRADIENT_WITH = new RegExp(`\\s+with\\s+(?:an?\\s+)?(?:(?:soft|smooth|subtle|bold|vibrant)\\s+)?(${PHRASE}\\s+(?:colou?r\\s+)?gradient)\\b(?!\\s+finish)`, 'gi')
const GRADIENT_OF = new RegExp(`\\s+(?:(?:displayed|shown|printed|rendered)\\s+)?in\\s+(?:an?\\s+)?(?:(?:soft|smooth|subtle|bold|vibrant)\\s+)?(gradient\\s+of\\s+${PHRASE})\\b`, 'gi')

/**
 * The colours of the object's details, after it: "with yellow and black accents", "and in white
 * colours", ", with green and white colours". They go whole, with the words that joined them on;
 * before "and" only they and the "and" go ("with black accents and soft shadows" keeps "with soft
 * shadows"). A room's accents are the setting's ("a poster in a room with yellow accents"), and so
 * are tones ("a concrete room with light and grey tones") and highlights, which are the light.
 */
const DETAILS = new RegExp(
  `(?:\\s*,)?(?:\\s+and)?\\s+(?:with|featuring|in)\\s+(?:(?:subtle|bold|bright|vivid|vibrant)\\s+)?(${PHRASE})\\s+(?:accents?|colou?rs|details?|trims?)\\b(\\s+and\\s+)?`,
  'gi'
)
/** Places whose details are the setting's, when they come straight before. */
const PLACE = /\b(?:rooms?|walls?|interior|space|studio|kitchen|office|floor|table|desk|shelf|counter)\s*$/i

/** "three white and one cardboard boxes": two counts of one kind of object, told apart by colour, become one count ("four boxes"). */
const COUNTS = ['a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const COUNT = `(?:${COUNTS.join('|')})`
const TWO_COUNTS = new RegExp(`\\b(${COUNT})\\s+${PHRASE}\\s+and\\s+(${COUNT})\\s+(?:(?!${STOP}\\b)[a-z-]+\\s+)?(?=${NOUN}\\b)`, 'gi')
const countOf = (word: string) => Math.max(1, COUNTS.indexOf(word.toLowerCase()) - 1)
/** "box" to "boxes", "card" to "cards"; a word already plural stays. */
const plural = (noun: string) => (/s$/i.test(noun) ? noun : /(x|ch|sh)$/i.test(noun) ? `${noun}es` : `${noun}s`)

/** Between fields, so a phrase can't run from one into the next. */
const FIELD_BREAK = ' | '

const tidy = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Where an object colour is in a text: the whole phrase, the part cut, and any words put in its place. */
interface Span {
  at: number
  end: number
  cutFrom: number
  cutTo: number
  insert?: string
}

/** Where each object colour is in a text. */
function colourSpans(text: string): Span[] {
  const spans: Span[] = []
  for (const m of text.matchAll(BEFORE)) {
    if (SETTING.test(text.slice(Math.max(0, m.index - 40), m.index)) || SETTING_NOUNS.test(m[2] ?? '')) continue
    // The colour and the space or hyphen after it.
    const colourEnd = m.index + m[1]!.length
    const next = text.slice(colourEnd).match(/^[\s-]+/)?.[0].length ?? 0
    spans.push({ at: m.index, end: m.index + m[0].length, cutFrom: m.index, cutTo: colourEnd + next })
  }
  for (const m of text.matchAll(AFTER)) {
    if (m[1] && PLACING.test(m[1].trim())) continue
    const inAt = m[0].search(/\s+in\s+/i)
    spans.push({ at: m.index, end: m.index + m[0].length, cutFrom: m.index + inAt, cutTo: m.index + m[0].length })
  }
  for (const m of text.matchAll(FINISH)) {
    if (FURNITURE.test(text.slice(0, m.index))) continue
    const at = m.index + m[1]!.length + (m[2]?.length ?? 0)
    spans.push({ at, end: at + m[3]!.length, cutFrom: m[4] ? m.index + m[1]!.length : m.index, cutTo: m.index + m[0].length })
  }
  for (const m of text.matchAll(PRONOUN)) {
    const at = m.index + m[1]!.length
    if (SETTING.test(text.slice(Math.max(0, at - 40), at))) continue
    const oneAt = m.index + m[0].length - m[3]!.length
    spans.push({ at, end: m.index + m[0].length, cutFrom: m.index, cutTo: oneAt })
  }
  for (const m of text.matchAll(DETAILS)) {
    if (PLACE.test(text.slice(0, m.index))) continue
    const at = m.index + m[0].toLowerCase().indexOf(m[1]!.toLowerCase())
    const end = m.index + m[0].length
    spans.push({ at, end: end - (m[2]?.length ?? 0), cutFrom: m[2] ? at : m.index, cutTo: end })
  }
  for (const m of [...text.matchAll(GRADIENT_WITH), ...text.matchAll(GRADIENT_OF)]) {
    const at = m.index + m[0].length - m[1]!.length
    spans.push({ at, end: m.index + m[0].length, cutFrom: m.index, cutTo: m.index + m[0].length })
  }
  for (const m of text.matchAll(TWO_COUNTS)) {
    const noun = text.slice(m.index + m[0].length).match(new RegExp(`^${NOUN}\\b`, 'i'))?.[0] ?? ''
    const end = m.index + m[0].length + noun.length
    const total = countOf(m[1]!) + countOf(m[2]!)
    spans.push({ at: m.index, end, cutFrom: m.index, cutTo: end, insert: `${COUNTS[total + 1] ?? total} ${plural(noun)}` })
  }
  return spans.sort((a, b) => a.at - b.at)
}

/**
 * A title or description starts with a capital, even after its first words were cut; a name that
 * starts small and has a capital inside ("iPhone", "iMac", "iPad") stays as it is.
 */
export function startWithCapital(text: string): string {
  return text.replace(/^[a-z](?![A-Z])/, (c) => c.toUpperCase())
}

/** The object-colour phrases in one answer: title, description and saved tag labels. */
export function objectColourWords(answer: { title: string; description: string }, savedLabels: string[]): string[] {
  const text = [answer.title, answer.description, ...savedLabels].join(FIELD_BREAK)
  return colourSpans(text).map((s) => tidy(text.slice(s.at, s.end)))
}

/** A text with its object colours cut, its article mended ("an orange box" to "a box") and its first letter kept a capital. */
function withoutColours(text: string): string {
  let out = ''
  let from = 0
  for (const s of colourSpans(text)) {
    if (s.cutFrom < from) continue
    out += text.slice(from, s.cutFrom) + (s.insert ?? '')
    from = s.cutTo
    const article = out.match(/\b(a|an)(\s+)$/i)
    if (article) {
      const an = /^[aeiou]/i.test(text.slice(from))
      const word = an ? 'an' : 'a'
      out = out.slice(0, out.length - article[0].length) + (article[1]![0] === 'A' ? word[0]!.toUpperCase() + word.slice(1) : word) + article[2]
    }
  }
  out = (out + text.slice(from)).replace(/ {2,}/g, ' ').replace(/ ([,.])/g, '$1')
  return /^[A-Z]/.test(text) ? startWithCapital(out) : out
}

/** An answer with every object colour taken out of its title, description and tag labels. */
export function withoutObjectColours<T extends { title: string; description: string; tags: { category: string; label: string }[] }>(answer: T): T {
  // Again until nothing changes: cutting "orange" from "orange gradient sweatshirt" leaves "gradient sweatshirt".
  const clean = (text: string) => {
    let now = text
    for (let i = 0; i < 4; i++) {
      const next = withoutColours(now)
      if (next === now) break
      now = next
    }
    return now
  }
  return {
    ...answer,
    title: clean(answer.title),
    description: clean(answer.description),
    tags: answer.tags.map((t) => ({ ...t, label: clean(t.label) })).filter((t) => t.label.trim() !== '')
  }
}
