import sharp from 'sharp'

/**
 * Pile variations (design/specs/pile-titles.md, L8): 1 to 3 words for each mockup in a pile, the
 * top included, that follow the pile's base title ("Long scroll MacBook · side view"). The 4B and
 * the 9B name them in one request for the whole pile: its covers numbered in one image, with their
 * file names (round 4 B, design/research/ai-round4.md). On the eval's 12 piles that got the 9B 35 of
 * 41 right (11 of 12 tops) at about 4 s a pile, and the 4B 26 of 41 at about 2 s. Their profiles
 * say so (`PromptProfile.variations`); Apple is never asked, since half to two thirds of its words
 * were wrong. A mockup the model calls "same", or gives nothing for, gets no words here, and
 * `PileTitles.landAi` gives it the fallback (its file marker or number).
 */

export const PILE_VARIATION_SYSTEM =
  "You help keep a designer's mockup library tidy. A pile holds variants of one mockup: other angles, scenes or states of the same product. Each mockup in a pile gets a short variation after the pile's title, such as \"side view\", \"on gravel\" or \"folded\" for a bike, so the person can tell them apart. Write in English."

export const VARIATION_RULES =
  'Look at the angle or view, the setting or surface, the state (open, closed, lit) and how many objects it shows. Never name a colour of the object itself, and never describe what is printed or shown on it.'

/** The question, about the sheet `pileSheet` makes from the pile's covers in this order. */
export function pileVariationsText(fileNames: string[]): string {
  const n = fileNames.length
  return [
    `The image shows ${n} mockups from one pile, numbered 1 to ${n} from left to right and top to bottom. Files: ${fileNames.map((f, i) => `${i + 1} = ${f}`).join(', ')}.`,
    `For each one, in 1 to 3 words, say what sets it apart from the others. ${VARIATION_RULES} Give each a different answer where you can, and answer "same" for one that looks the same as another.`,
    `Reply with JSON: variations, a list of ${n} answers in order.`
  ].join('\n')
}

/** The chat request for a pile: the sheet, then the question, held to one answer per mockup. */
export function pileVariationsRequest(sheetUrl: string, fileNames: string[]): object {
  const n = fileNames.length
  return {
    messages: [
      { role: 'system', content: PILE_VARIATION_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: sheetUrl } },
          { type: 'text', text: pileVariationsText(fileNames) }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'variation',
        schema: {
          type: 'object',
          properties: { variations: { type: 'array', items: { type: 'string' }, minItems: n, maxItems: n } },
          required: ['variations']
        }
      }
    },
    temperature: 0,
    max_tokens: 60 + 30 * n
  }
}

/** The sheet's layout, as the eval measured it: at most three to a row, 1024 px across, a numbered strip over each cover. */
const SHEET_WIDTH = 1024
const PER_ROW = 3
const LABEL = 44

/**
 * The pile's covers side by side on white, numbered 1, 2, 3 in pile order, as a JPEG data URL. A
 * cover that can't be read leaves its tile blank, so the numbers still match the file names.
 */
export async function pileSheet(coverPaths: string[]): Promise<string> {
  const cols = Math.min(PER_ROW, coverPaths.length)
  const w = Math.floor(SHEET_WIDTH / cols)
  const tiles = await Promise.all(
    coverPaths.map(async (path, i) => {
      const image = await sharp(path)
        .resize(w, w, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .toBuffer()
        .catch(() => null)
      const label = Buffer.from(
        `<svg width="${w}" height="${LABEL}"><rect width="${w}" height="${LABEL}" fill="#ffffff"/><text x="12" y="34" font-size="32" font-weight="bold" font-family="Helvetica" fill="#000000">${i + 1}</text></svg>`
      )
      return { image, label }
    })
  )
  const rows = Math.ceil(coverPaths.length / cols)
  const sheet = await sharp({ create: { width: cols * w, height: rows * (w + LABEL), channels: 3, background: '#ffffff' } })
    .composite(
      tiles.flatMap((t, i) => {
        const left = (i % cols) * w
        const top = Math.floor(i / cols) * (w + LABEL)
        return [{ input: t.label, left, top }, ...(t.image ? [{ input: t.image, left, top: top + LABEL }] : [])]
      })
    )
    .jpeg({ quality: 88 })
    .toBuffer()
  return `data:image/jpeg;base64,${sheet.toString('base64')}`
}

/** An answer that names no difference. */
const NO_DIFFERENCE = /^\s*(?:same|the same|none|no difference|identical|n\/a|nothing)\b/i

/**
 * The words from the reply, one per mockup in pile order: as the model wrote them, trimmed of
 * spaces and a closing full stop. Null for "same", an empty answer or a missing one, and for every
 * mockup when the reply can't be read.
 */
export function readPileVariations(text: string, count: number): (string | null)[] {
  let said: unknown
  try {
    said = (JSON.parse(text) as { variations?: unknown }).variations
  } catch {
    said = null
  }
  const answers = Array.isArray(said) ? said : []
  return Array.from({ length: count }, (_, i) => {
    const answer = answers[i]
    if (typeof answer !== 'string') return null
    const words = answer.trim().replace(/\.$/, '').trim()
    return words === '' || NO_DIFFERENCE.test(words) ? null : words
  })
}

/** One mockup of a pile, in pile order (the top first). */
export interface PileMember {
  coverPath: string
  fileName: string
}

/**
 * The model's words for every mockup in a pile, the top included, from one request through
 * `complete` (the model's chat, answering with the reply's text). Nothing for any of them when the
 * request fails, or for a pile of one, which has nothing to tell apart.
 */
export async function askPileVariations(
  pile: PileMember[],
  complete: (request: object) => Promise<string>
): Promise<(string | null)[]> {
  const none = pile.map(() => null)
  if (pile.length < 2) return none
  try {
    const sheet = await pileSheet(pile.map((m) => m.coverPath))
    return readPileVariations(await complete(pileVariationsRequest(sheet, pile.map((m) => m.fileName))), pile.length)
  } catch {
    return none
  }
}
