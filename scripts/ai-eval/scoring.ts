import { normaliseTagLabel } from '../../src/shared/tags'
import type { EvalResult } from './prompts/prompt-version'

export interface GoldQuery {
  q: string
  relevant: string[]
}

export interface Gold {
  items: Record<
    string,
    {
      title: string
      description: string
      tags: { category: string; label: string }[]
      notes?: string
    }
  >
  queries: GoldQuery[]
}

export interface QueryScore {
  q: string
  relevant: string[]
  /** Ids the search returned, best first. */
  returned: string[]
  /** Relevant ids it missed. */
  missed: string[]
  recall: number
  precision: number
  /** Every relevant item is in the top `max(3, relevant.length)`. */
  allInTop: boolean
  /** Set when the search itself failed (an FTS syntax error); nothing is returned. */
  error?: string
}

/** How one query did against its relevant items. An empty result has precision 0. */
export function scoreQuery(query: GoldQuery, returned: string[], error?: string): QueryScore {
  const relevant = new Set(query.relevant)
  const found = returned.filter((id) => relevant.has(id))
  const top = new Set(returned.slice(0, Math.max(3, query.relevant.length)))
  return {
    q: query.q,
    relevant: query.relevant,
    returned,
    missed: query.relevant.filter((id) => !returned.includes(id)),
    recall: relevant.size === 0 ? 1 : found.length / relevant.size,
    precision: returned.length === 0 ? 0 : found.length / returned.length,
    allInTop: query.relevant.every((id) => top.has(id)),
    ...(error !== undefined && { error })
  }
}

export interface Headline {
  queries: number
  recall: number
  precision: number
  /** Share of queries with every relevant item in their top `max(3, relevant.length)`. */
  allInTop: number
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length

/** Macro averages: every query counts the same, however many items it has. */
export function headline(scores: QueryScore[]): Headline {
  return {
    queries: scores.length,
    recall: mean(scores.map((s) => s.recall)),
    precision: mean(scores.map((s) => s.precision)),
    allInTop: mean(scores.map((s) => (s.allInTop ? 1 : 0)))
  }
}

/** For each item that some query wants: the share of those queries that return it. */
export function itemFindRates(
  scores: QueryScore[]
): Record<string, { queries: number; found: number; rate: number }> {
  const rates: Record<string, { queries: number; found: number; rate: number }> = {}
  for (const s of scores) {
    for (const id of s.relevant) {
      const r = (rates[id] ??= { queries: 0, found: 0, rate: 0 })
      r.queries++
      if (s.returned.includes(id)) r.found++
      r.rate = r.found / r.queries
    }
  }
  return rates
}

/** Words that name nothing on their own. A title made of these and filler says nothing. */
export const GENERIC_WORDS = [
  'mockup',
  'mockups',
  'template',
  'design',
  'image',
  'picture',
  'photo',
  'product',
  'item',
  'object',
  'file',
  'psd',
  'free'
]

const FILLER = new Set(['a', 'an', 'the', 'of', 'on', 'in', 'with', 'and', 'for', 'at', 'by', 'to'])

/** Download sites whose names turn up in file names. */
const SITE_NAMES = [
  'pixeden',
  'freepik',
  'envato',
  'mockupworld',
  'pngtree',
  'graphicburger',
  'unsplash'
]

/** A stock or pack code: six or more letters and digits with at least one of each (`TOJ8V2I9`, `M003T1514`). */
const STOCK_CODE = /^(?=[a-z]*\d)(?=\d*[a-z])[a-z\d]{6,}$/i

/** Device names written as one token that look like codes but are real words. */
const NOT_CODES = new Set(['iphone15', 'iphone16', 'iphone14', 'ipad10', 'm1', 'm2', 'm3', 'm4'])

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

export interface FormatCheck {
  titleLength: number
  /** Written like a file name: snake_case, or words joined by hyphens with no spaces. */
  titleCodeStyle: boolean
  /** File-name junk in the title or description: "psd", "free", stock codes, site names, the zip's name. */
  junk: string[]
  /** "Mockup" (or other generic words) is all the title names. */
  titleSaysNothing: boolean
  genericWords: string[]
  tagCount: number
  /** Labels given more than once, in any category. */
  duplicateTags: string[]
}

export interface FormatInput {
  fileName: string
  /** The cleaned zip name, when the PSD came out of one. */
  zipName?: string | null
}

export function checkFormat(result: EvalResult, item: FormatInput): FormatCheck {
  const title = result.title.trim()
  const text = `${title} ${result.description}`
  const all = words(text)
  const junk = new Set<string>()
  for (const w of all) {
    if (w === 'psd' || w === 'free') junk.add(w)
    if (STOCK_CODE.test(w) && !NOT_CODES.has(w)) junk.add(w)
    if (SITE_NAMES.includes(w)) junk.add(w)
  }
  const lower = text.toLowerCase()
  const stem = item.fileName.replace(/\.psd$/i, '').trim()
  if (/[_-]/.test(stem) && stem.length > 3 && lower.includes(stem.toLowerCase())) junk.add(stem)
  const zip = item.zipName?.trim()
  if (zip && zip.includes(' ') && lower.includes(zip.toLowerCase())) junk.add(zip)

  const titleWords = words(title)
  const named = titleWords.filter((w) => !FILLER.has(w) && !GENERIC_WORDS.includes(w))

  const counts = new Map<string, number>()
  for (const t of result.tags) {
    const key = normaliseTagLabel(t.label)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    titleLength: title.length,
    titleCodeStyle: title.includes('_') || (!/\s/.test(title) && title.includes('-')),
    junk: [...junk],
    titleSaysNothing: named.length === 0,
    genericWords: [...new Set(titleWords.filter((w) => GENERIC_WORDS.includes(w)))],
    tagCount: result.tags.length,
    duplicateTags: [...counts].filter(([, n]) => n > 1).map(([label]) => label)
  }
}
