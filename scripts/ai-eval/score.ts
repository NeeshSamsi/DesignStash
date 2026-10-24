/**
 * ai-eval:score. Scores a run against `scripts/ai-eval/gold.json`: each gold query is searched with
 * the app's own search over the run's titles, descriptions and saved tags, and each result is
 * checked for file-name habits. The gold data itself is searched the same way, as the ceiling.
 * Each answer is also checked for words its gold entry's `absent` list rules out, and each saved
 * tag for support in the gold text.
 *
 *   pnpm ai-eval:score --model qwen2.5-vl-3b --prompt v0 [--no-synonyms]
 *
 * The search adds the app's hidden synonym words to every answer; --no-synonyms leaves them off.
 *
 * Writes runs/<model>/<prompt>/score.json and score.md. An item that failed is searched as the app
 * would save it with no suggestion: its file name as the title, no description, no tags.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanArchiveName } from '../../src/main/import/archive-name'
import { stemOf } from '../../src/main/import/look-over-service'
import { HELD_OUT_DIR, SIGN_OFF_DIR, argValue, goldPath, readItems, runDir, writeJson, type EvalItem } from './eval-files'
import {
  checkAnswer,
  compileAbsent,
  summarise,
  type AnswerCheck,
  type HallucinationSummary
} from './hallucination'
import type { ItemResult } from './run'
import {
  checkFormat,
  headline,
  itemFindRates,
  scoreQuery,
  type FormatCheck,
  type Gold,
  type Headline,
  type QueryScore
} from './scoring'
import { SearchSim, type IndexedItem } from './search-sim'
import {
  EMBED_MODELS,
  TextEmbedder,
  fuse,
  imageSimilarities,
  textSimilarities,
  type Fusion,
  type Lever
} from './meaning'
import { createTagSnapper } from './searchable-tags'
import {
  badAlternate,
  placeholderWords,
  summarisePlaceholders,
  type PlaceholderCheck,
  type PlaceholderData
} from './placeholder'
import { objectColourWords, summariseObjectColours, type ObjectColourCheck } from './object-colour'
import { meaningDocument } from '../../src/main/search/meaning'

const GOLD_PATH = goldPath('gold.json')
/** What each item's design slot shows, and the words that describe it (`placeholder.ts`). */
const PLACEHOLDERS_PATH = join(import.meta.dirname, 'placeholders.json')
const HELD_OUT_GOLD_PATH = goldPath('gold-heldout.json')
/**
 * `--held-out` is the final check: the held-out items join the search and their reference answers
 * (gold-heldout.json) join gold.json. Without it they are left out, so a run that answered them
 * scores the same as one that didn't.
 */
/**
 * `--queries <file>` scores a separate query file (`[{ q, relevant }]`, written blind) over only the
 * held-out and sign-off items it was judged against, so tuning items are not counted as wrong.
 */
const QUERIES_PATH = argValue('queries')
const HELD_OUT = process.argv.includes('--held-out') || QUERIES_PATH !== undefined
const SIGN_OFF_GOLD_PATH = goldPath('gold-signoff.json')
/** `--sign-off`: the sign-off items and gold-signoff.json join in, like `--held-out` (and alongside it, if both). */
const SIGN_OFF = process.argv.includes('--sign-off') || QUERIES_PATH !== undefined
/**
 * Meaning search, off unless asked for: `--embed bge|nomic|qwen3` blends in text embeddings,
 * `--image` the SigLIP image scores (`siglip-scores.json`), both blended by `--fuse cutoff|rrf`.
 * `--cut` and `--image-cut` set the similarity a meaning hit needs.
 */
const EMBED = argValue('embed')
const IMAGE = process.argv.includes('--image')
const FUSION = (argValue('fuse') ?? 'cutoff') as Fusion
const CUT = Number(argValue('cut') ?? '0.6')
/** Rank rule: at most this many meaning hits per query (above the `--cut` floor). Unlimited if unset. */
const TOP = argValue('top') === undefined ? undefined : Number(argValue('top'))
const IMAGE_TOP = argValue('image-top') === undefined ? undefined : Number(argValue('image-top'))
const IMAGE_CUT = Number(argValue('image-cut') ?? '0.3')
const MEANING = [EMBED && `embed-${EMBED}`, IMAGE && 'image'].filter(Boolean).join('-')
const SCORE_NAME = [
  'score',
  argValue('gold') && `gold-${argValue('gold')}`,
  HELD_OUT && 'heldout',
  SIGN_OFF && 'signoff',
  QUERIES_PATH && 'userq',
  MEANING && `${MEANING}-${FUSION}${TOP !== undefined ? `-top${TOP}` : ''}`
]
  .filter(Boolean)
  .join('-')

interface HeldOutGold extends Gold {
  /** Held-out ids to add to gold.json queries of the same text. */
  addToQueries: Record<string, string[]>
}

function withHeldOut(gold: Gold, path: string = HELD_OUT_GOLD_PATH): Gold {
  const held = JSON.parse(readFileSync(path, 'utf8')) as HeldOutGold
  const queries = gold.queries.map((q) => ({
    ...q,
    relevant: [...q.relevant, ...(held.addToQueries[q.q] ?? [])]
  }))
  const known = new Set(queries.map((q) => q.q))
  const extra = Object.entries(held.addToQueries)
    .filter(([q]) => !known.has(q))
    .map(([q, relevant]) => ({ q, relevant }))
  return {
    ...gold,
    items: { ...gold.items, ...held.items },
    queries: [...queries, ...held.queries, ...extra]
  }
}

/** A query file: a bare `[{ q, relevant }]`, or an object with those under `queries` (gold-blind.json). */
function readQueries(path: string): Gold['queries'] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Gold['queries'] | { queries: Gold['queries'] }
  return Array.isArray(raw) ? raw : raw.queries
}

function inDir(item: EvalItem, dir: string): boolean {
  return item.source.path.includes(`/${dir}/`)
}

/** Whether a scored run includes this item: tuning items always, held-out and sign-off ones with their flags. */
function inScope(item: EvalItem): boolean {
  if (QUERIES_PATH) return inDir(item, HELD_OUT_DIR) || inDir(item, SIGN_OFF_DIR)
  if (inDir(item, HELD_OUT_DIR)) return HELD_OUT
  if (inDir(item, SIGN_OFF_DIR)) return SIGN_OFF
  return true
}

/** Every answer in one pass that has a gold entry, checked against it. A failed answer is left out. */
function checkPass(
  gold: Gold,
  items: EvalItem[],
  byId: Map<string, ItemResult>,
  repeat: number
): AnswerCheck[] {
  return items.flatMap((item) => {
    const entry = gold.items[item.id]
    const result = byId.get(item.id)
    if (!entry || !result?.parsed) return []
    const { title, description, keywords } = result.parsed
    const answer = { id: item.id, repeat, title, description, ...(keywords && { keywords }) }
    return [
      checkAnswer(
        answer,
        result.searchTags.map((t) => t.label),
        entry
      )
    ]
  })
}

const SYNONYMS = !process.argv.includes('--no-synonyms')
const NAMES = !process.argv.includes('--no-names')
// Stemming is not in the app (see the guide), so it is off unless asked for.
const STEM = process.argv.includes('--stem')

function searchAll(gold: Gold, indexed: IndexedItem[], levers: Lever[] = []): QueryScore[] {
  const sim = new SearchSim(indexed, { synonyms: SYNONYMS, names: NAMES, stem: STEM })
  try {
    return gold.queries.map((query) => {
      const { ids, error } = sim.search(query.q)
      return scoreQuery(query, fuse(FUSION, query.q, ids, levers), error)
    })
  } finally {
    sim.close()
  }
}

/** What the app would index for an item in one pass of a run. */
function indexedFor(item: EvalItem, result: ItemResult | undefined): IndexedItem {
  if (result?.parsed) {
    return {
      id: item.id,
      title: result.parsed.title,
      description: result.parsed.description,
      tags: result.searchTags,
      fileName: item.fileName,
      folderTrail: item.folderTrail,
      ...(result.parsed.keywords && { keywords: result.parsed.keywords })
    }
  }
  return {
    id: item.id,
    title: stemOf(item.fileName),
    description: '',
    tags: [],
    fileName: item.fileName,
    folderTrail: item.folderTrail
  }
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function meanHeadline(all: Headline[]): Headline {
  const avg = (pick: (h: Headline) => number) => all.reduce((t, h) => t + pick(h), 0) / all.length
  return {
    queries: all[0]?.queries ?? 0,
    recall: avg((h) => h.recall),
    precision: avg((h) => h.precision),
    allInTop: avg((h) => h.allInTop)
  }
}

async function main(): Promise<void> {
  const model = argValue('model')
  const version = argValue('prompt')
  if (!model || !version)
    throw new Error('Usage: pnpm ai-eval:score --model <id> --prompt <version> [--no-synonyms] [--no-names] [--stem] [--held-out] [--sign-off] [--embed bge|nomic|qwen3|nlsentence|nlcontextual] [--image] [--fuse cutoff|rrf] [--cut n] [--top k] [--image-cut n] [--queries file]')
  if (!existsSync(GOLD_PATH)) throw new Error(`No gold data at ${GOLD_PATH}`)
  const dir = runDir(model, version)
  const resultsPath = join(dir, 'results.json')
  if (!existsSync(resultsPath))
    throw new Error(`No run at ${resultsPath}. Run \`pnpm ai-eval:run\` first.`)

  const goldOnly = JSON.parse(readFileSync(GOLD_PATH, 'utf8')) as Gold
  const withHeld = HELD_OUT ? withHeldOut(goldOnly) : goldOnly
  const goldAll = SIGN_OFF ? withHeldOut(withHeld, SIGN_OFF_GOLD_PATH) : withHeld
  const items = readItems().filter((i) => !i.duplicateOf && inScope(i))
  const gold: Gold = QUERIES_PATH
    ? {
        ...goldAll,
        items: Object.fromEntries(
          Object.entries(goldAll.items).filter(([id]) => items.some((i) => i.id === id))
        ),
        queries: readQueries(QUERIES_PATH).map((q) => ({
          q: q.q,
          relevant: q.relevant
        }))
      }
    : goldAll
  const scoped = new Set(items.map((i) => i.id))
  const results = (JSON.parse(readFileSync(resultsPath, 'utf8')) as ItemResult[]).filter((r) =>
    scoped.has(r.id)
  )

  const known = new Set(items.map((i) => i.id))
  const strays = [...Object.keys(gold.items), ...gold.queries.flatMap((q) => q.relevant)].filter(
    (id) => !known.has(id)
  )
  if (strays.length > 0)
    throw new Error(`gold.json names ids not in items.json: ${[...new Set(strays)].join(', ')}`)
  for (const [id, entry] of Object.entries(gold.items)) {
    try {
      compileAbsent(entry.absent ?? [])
    } catch (err) {
      throw new Error(`gold.json ${id}: ${(err as Error).message}`, { cause: err })
    }
  }

  const placeholders = existsSync(PLACEHOLDERS_PATH)
    ? (JSON.parse(readFileSync(PLACEHOLDERS_PATH, 'utf8')) as PlaceholderData)
    : null
  const repeats = [...new Set(results.map((r) => r.repeat))].sort((a, b) => a - b)
  const embedder = EMBED ? new TextEmbedder(EMBED_MODELS[EMBED]!) : null
  const imageLever = IMAGE ? imageSimilarities() : null
  const queryTexts = gold.queries.map((q) => q.q)
  const docText = (i: IndexedItem) => meaningDocument(i.title, i.description, i.tags.map((t) => t.label))
  const passes = []
  for (const repeat of repeats) {
    const byId = new Map(results.filter((r) => r.repeat === repeat).map((r) => [r.id, r]))
    const missing = items.filter((i) => !byId.has(i.id)).map((i) => i.id)
    const indexed = items.map((i) => indexedFor(i, byId.get(i.id)))
    const levers: Lever[] = []
    if (embedder)
      levers.push({
        sims: await textSimilarities(
          embedder,
          indexed.map((i) => ({ id: i.id, text: docText(i) })),
          queryTexts
        ),
        cut: CUT,
        ...(TOP !== undefined && { top: TOP })
      })
    if (imageLever) levers.push({ sims: imageLever, cut: IMAGE_CUT, ...(IMAGE_TOP !== undefined && { top: IMAGE_TOP }) })
    const scores = searchAll(gold, indexed, levers)
    const checks = checkPass(gold, items, byId, repeat)
    const placeholderChecks: PlaceholderCheck[] = placeholders
      ? items.flatMap((item) => {
          const entry = placeholders.items[item.id]
          const result = byId.get(item.id)
          if (!entry || !result?.parsed) return []
          const words = placeholderWords(result.parsed, result.searchTags.map((t) => t.label), entry, placeholders.generic)
          return [{ id: item.id, repeat, words }]
        })
      : []
    const objectColourChecks: ObjectColourCheck[] = items.flatMap((item) => {
      const result = byId.get(item.id)
      if (!result?.parsed) return []
      return [{ id: item.id, repeat, words: objectColourWords(result.parsed, result.searchTags.map((t) => t.label)) }]
    })
    const answered = items.flatMap((item) => byId.get(item.id)?.parsed ?? [])
    const badAlternates = answered.flatMap((p) => badAlternate(p.description) ?? [])
    passes.push({
      placeholderChecks,
      objectColourChecks,
      badAlternates: { answers: answered.length, bad: badAlternates },
      repeat,
      byId,
      missing,
      scores,
      headline: headline(scores),
      checks,
      hallucination: summarise(checks)
    })
  }
  embedder?.close()
  const first = passes[0]!
  const allChecks = passes.flatMap((p) => p.checks)
  const firstChecks = new Map(first.checks.map((c) => [c.id, c]))

  // A gold entry that matches its own absent list would count a right answer as made up.
  const goldAbsentConflicts = Object.entries(gold.items).flatMap(([id, entry]) => {
    const { absentWords } = checkAnswer(
      { id, repeat: 0, title: entry.title, description: entry.description },
      entry.tags.map((t) => t.label),
      entry
    )
    return absentWords.length > 0 ? [{ id, words: absentWords }] : []
  })

  // A gold entry that matches its own placeholder words describes the placeholder itself.
  const goldPlaceholderConflicts = placeholders
    ? Object.entries(gold.items).flatMap(([id, entry]) => {
        const ph = placeholders.items[id]
        if (!ph) return []
        const words = placeholderWords(entry, entry.tags.map((t) => t.label), ph, placeholders.generic)
        return words.length > 0 ? [{ id, words }] : []
      })
    : []
  const allPlaceholder = passes.flatMap((p) => p.placeholderChecks)
  const allObjectColour = passes.flatMap((p) => p.objectColourChecks)
  // A gold entry with an object colour breaks round 4's rule itself.
  const goldObjectColourConflicts = Object.entries(gold.items).flatMap(([id, entry]) => {
    const words = objectColourWords(entry, entry.tags.map((t) => t.label))
    return words.length > 0 ? [{ id, words }] : []
  })
  const bad = passes.flatMap((p) => p.badAlternates.bad)
  const badAnswers = passes.reduce((t, p) => t + p.badAlternates.answers, 0)

  const unsupportedCounts = new Map<string, number>()
  for (const check of allChecks)
    for (const label of check.unsupported)
      unsupportedCounts.set(label, (unsupportedCounts.get(label) ?? 0) + 1)

  // The ceiling: the gold titles, descriptions and tags, saved and searched the same way.
  const snap = createTagSnapper()
  const goldIndexed: IndexedItem[] = []
  for (const item of items) {
    const g = gold.items[item.id]
    if (g)
      goldIndexed.push({
        id: item.id,
        title: g.title,
        description: g.description,
        tags: await snap(g.tags),
        fileName: item.fileName,
        folderTrail: item.folderTrail
      })
    else goldIndexed.push(indexedFor(item, undefined))
  }
  const ceiling = headline(searchAll(gold, goldIndexed))

  const formats = new Map<string, FormatCheck>()
  for (const item of items) {
    const parsed = first.byId.get(item.id)?.parsed
    if (parsed) {
      formats.set(
        item.id,
        checkFormat(parsed, {
          fileName: item.fileName,
          zipName: item.source.zip ? cleanArchiveName(item.source.zip) : null
        })
      )
    }
  }
  const checks = [...formats.values()]
  const formatSummary = {
    checked: checks.length,
    avgTitleLength: Math.round(
      checks.reduce((t, c) => t + c.titleLength, 0) / Math.max(checks.length, 1)
    ),
    titleCodeStyle: checks.filter((c) => c.titleCodeStyle).length,
    junk: checks.filter((c) => c.junk.length > 0).length,
    titleSaysNothing: checks.filter((c) => c.titleSaysNothing).length,
    genericWords: checks.filter((c) => c.genericWords.length > 0).length,
    avgTagCount: +(checks.reduce((t, c) => t + c.tagCount, 0) / Math.max(checks.length, 1)).toFixed(
      2
    ),
    duplicateTags: checks.filter((c) => c.duplicateTags.length > 0).length
  }

  const rates = itemFindRates(first.scores)
  const failures = results.filter((r) => r.error)
  const score = {
    model,
    prompt: version,
    synonyms: SYNONYMS,
    scoredAt: new Date().toISOString(),
    repeats: repeats.length,
    headline: meanHeadline(passes.map((p) => p.headline)),
    perRepeat: passes.map((p) => ({
      repeat: p.repeat,
      ...p.headline,
      hallucination: p.hallucination
    })),
    ceiling,
    hallucination: summarise(allChecks),
    absentFound: allChecks
      .filter((c) => c.absentWords.length > 0)
      .map((c) => ({ id: c.id, repeat: c.repeat, words: c.absentWords })),
    goldAbsentConflicts,
    placeholder: summarisePlaceholders(allPlaceholder),
    placeholderFound: allPlaceholder
      .filter((c) => c.words.length > 0)
      .map((c) => ({ id: c.id, repeat: c.repeat, words: c.words })),
    goldPlaceholderConflicts,
    objectColour: summariseObjectColours(allObjectColour),
    objectColourFound: allObjectColour
      .filter((c) => c.words.length > 0)
      .map((c) => ({ id: c.id, repeat: c.repeat, words: c.words })),
    goldObjectColourConflicts,
    badAlternates: { answers: badAnswers, rate: badAnswers === 0 ? 0 : bad.length / badAnswers, phrases: bad },
    meanMs: Math.round(results.reduce((t, r) => t + r.elapsedMs, 0) / Math.max(results.length, 1)),
    unsupportedTags: [...unsupportedCounts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count })),
    failures: failures.map((r) => ({ id: r.id, repeat: r.repeat, error: r.error })),
    missing: first.missing,
    searchErrors: first.scores.filter((s) => s.error).map((s) => ({ q: s.q, error: s.error })),
    formatSummary,
    queries: first.scores,
    items: items.map((item) => {
      const parsed = first.byId.get(item.id)?.parsed
      return {
        id: item.id,
        title: parsed?.title ?? null,
        tags: first.byId.get(item.id)?.searchTags.map((t) => t.label) ?? [],
        keywords: parsed?.keywords ?? [],
        absentWords: firstChecks.get(item.id)?.absentWords ?? [],
        unsupportedTags: firstChecks.get(item.id)?.unsupported ?? [],
        find: rates[item.id] ?? null,
        format: formats.get(item.id) ?? null
      }
    })
  }
  writeJson(join(dir, `${SCORE_NAME}.json`), score)
  writeFileSync(join(dir, `${SCORE_NAME}.md`), markdown(score))

  console.log(
    `${model} · ${version} · ${gold.queries.length} queries · ${repeats.length} pass(es)` +
      (SYNONYMS ? '' : ' · no synonyms') +
      (NAMES ? '' : ' · no names') +
      (STEM ? ' · stem' : '')
  )
  console.log(
    `recall ${pct(score.headline.recall)}  precision ${pct(score.headline.precision)}  ` +
      `all-in-top ${pct(score.headline.allInTop)}`
  )
  console.log(
    `gold ceiling: recall ${pct(ceiling.recall)}  precision ${pct(ceiling.precision)}  all-in-top ${pct(ceiling.allInTop)}`
  )
  console.log(
    `failures ${failures.length}, missing ${first.missing.length}, search errors ${score.searchErrors.length}, ` +
      `junk ${formatSummary.junk}/${formatSummary.checked}, code-style titles ${formatSummary.titleCodeStyle}`
  )
  const h = score.hallucination
  console.log(
    `hallucinated ${pct(h.hallucinated)} of ${h.answers} answers, ${h.absentPerAnswer.toFixed(2)} absent words per answer, ` +
      `tag support ${pct(h.tagSupport)} of ${h.labels} labels`
  )
  const ph = score.placeholder
  console.log(
    `placeholder mentioned in ${pct(ph.mentioned)} of ${ph.answers} answers (${ph.wordsPerAnswer.toFixed(2)} words each); ` +
      `bad "also called" in ${pct(score.badAlternates.rate)} of ${score.badAlternates.answers}; mean ${score.meanMs} ms per mockup`
  )
  const oc = score.objectColour
  console.log(`object colour in ${pct(oc.mentioned)} of ${oc.answers} answers (${oc.wordsPerAnswer.toFixed(2)} each)`)
  if (goldObjectColourConflicts.length > 0)
    console.log(`gold entries with an object colour: ${goldObjectColourConflicts.map((c) => `${c.id} (${c.words.join(', ')})`).join('; ')}`)
  if (goldPlaceholderConflicts.length > 0)
    console.log(
      `gold entries describing their placeholder: ${goldPlaceholderConflicts.map((c) => `${c.id} (${c.words.join(', ')})`).join('; ')}`
    )
  if (goldAbsentConflicts.length > 0)
    console.log(
      `gold entries matching their own absent list: ${goldAbsentConflicts.map((c) => `${c.id} (${c.words.join(', ')})`).join('; ')}`
    )
  console.log(`Wrote ${join(dir, `${SCORE_NAME}.json`)} and ${SCORE_NAME}.md`)
}

function markdown(s: {
  model: string
  prompt: string
  repeats: number
  headline: Headline
  ceiling: Headline
  perRepeat: { repeat: number; hallucination: HallucinationSummary }[]
  hallucination: HallucinationSummary
  absentFound: { id: string; repeat: number; words: string[] }[]
  goldAbsentConflicts: { id: string; words: string[] }[]
  unsupportedTags: { label: string; count: number }[]
  failures: { id: string }[]
  missing: string[]
  searchErrors: { q: string; error?: string | undefined }[]
  formatSummary: Record<string, number>
  queries: QueryScore[]
  items: {
    id: string
    title: string | null
    find: { rate: number; queries: number } | null
    format: FormatCheck | null
  }[]
}): string {
  const lines = [
    `# ${s.model} · ${s.prompt}`,
    '',
    `${s.headline.queries} gold queries, ${s.repeats} pass(es). Macro averages; "all in top" means every relevant item is in the top max(3, relevant).`,
    '',
    '| | Recall | Precision | All in top |',
    '|---|---|---|---|',
    `| This run | ${pct(s.headline.recall)} | ${pct(s.headline.precision)} | ${pct(s.headline.allInTop)} |`,
    `| Gold ceiling | ${pct(s.ceiling.recall)} | ${pct(s.ceiling.precision)} | ${pct(s.ceiling.allInTop)} |`,
    '',
    `Failures: ${s.failures.length}. Missing from the run: ${s.missing.length}. Search errors: ${s.searchErrors.map((e) => `"${e.q}" (${e.error})`).join(', ') || 'none'}.`,
    '',
    '## Hallucination',
    '',
    `${s.hallucination.answers} answers checked against an absent list (items × passes; failed answers left out). Tag support is the share of saved tag labels whose words are all in the gold title, description or tags.`,
    '',
    '| | Hallucinated | Absent words per answer | Tag support |',
    '|---|---|---|---|',
    hallucinationRow('All passes', s.hallucination),
    ...(s.perRepeat.length > 1
      ? s.perRepeat.map((p) => hallucinationRow(`Pass ${p.repeat}`, p.hallucination))
      : []),
    '',
    '### Absent words found',
    '',
    ...(s.absentFound.length > 0
      ? s.absentFound.map((a) => `- ${a.id} (pass ${a.repeat}): ${a.words.join(', ')}`)
      : ['None.']),
    ...(s.goldAbsentConflicts.length > 0
      ? [
          '',
          '### Gold entries matching their own absent list',
          '',
          ...s.goldAbsentConflicts.map((c) => `- ${c.id}: ${c.words.join(', ')}`)
        ]
      : []),
    '',
    '### Most common unsupported tags',
    '',
    ...(s.unsupportedTags.length > 0
      ? s.unsupportedTags.slice(0, 25).map((t) => `- ${t.label} (${t.count})`)
      : ['None.']),
    '',
    '## Format',
    '',
    ...Object.entries(s.formatSummary).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Queries that missed',
    ''
  ]
  const missed = s.queries.filter((q) => q.recall < 1).sort((a, b) => a.recall - b.recall)
  for (const q of missed)
    lines.push(`- "${q.q}": recall ${pct(q.recall)}, missed ${q.missed.join(', ')}`)
  if (missed.length === 0) lines.push('None.')
  lines.push('', '## Items no query finds', '')
  const lost = s.items.filter((i) => i.find && i.find.rate === 0)
  for (const i of lost)
    lines.push(`- ${i.id}: "${i.title ?? '(failed)'}" (wanted by ${i.find!.queries})`)
  if (lost.length === 0) lines.push('None.')
  lines.push('', '## Titles with junk', '')
  const junky = s.items.filter(
    (i) => i.format && (i.format.junk.length > 0 || i.format.titleCodeStyle)
  )
  for (const i of junky)
    lines.push(
      `- ${i.id}: "${i.title}" (${[...i.format!.junk, ...(i.format!.titleCodeStyle ? ['code style'] : [])].join(', ')})`
    )
  if (junky.length === 0) lines.push('None.')
  return `${lines.join('\n')}\n`
}

function hallucinationRow(name: string, h: HallucinationSummary): string {
  return `| ${name} | ${pct(h.hallucinated)} | ${h.absentPerAnswer.toFixed(2)} | ${pct(h.tagSupport)} |`
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
