/**
 * ai-eval:score. Scores a run against `scripts/ai-eval/gold.json`: each gold query is searched with
 * the app's own search over the run's titles, descriptions and saved tags, and each result is
 * checked for file-name habits. The gold data itself is searched the same way, as the ceiling.
 *
 *   pnpm ai-eval:score --model qwen2.5-vl-3b --prompt v0
 *
 * Writes runs/<model>/<prompt>/score.json and score.md. An item that failed is searched as the app
 * would save it with no suggestion: its file name as the title, no description, no tags.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanArchiveName } from '../../src/main/import/archive-name'
import { stemOf } from '../../src/main/import/look-over-service'
import { argValue, readItems, runDir, writeJson, type EvalItem } from './eval-files'
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
import { createTagSnapper } from './searchable-tags'

const GOLD_PATH = join(import.meta.dirname, 'gold.json')

function searchAll(gold: Gold, indexed: IndexedItem[]): QueryScore[] {
  const sim = new SearchSim(indexed)
  try {
    return gold.queries.map((query) => {
      const { ids, error } = sim.search(query.q)
      return scoreQuery(query, ids, error)
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
      tags: result.searchTags
    }
  }
  return { id: item.id, title: stemOf(item.fileName), description: '', tags: [] }
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
    throw new Error('Usage: pnpm ai-eval:score --model <id> --prompt <version>')
  if (!existsSync(GOLD_PATH)) throw new Error(`No gold data at ${GOLD_PATH}`)
  const dir = runDir(model, version)
  const resultsPath = join(dir, 'results.json')
  if (!existsSync(resultsPath))
    throw new Error(`No run at ${resultsPath}. Run \`pnpm ai-eval:run\` first.`)

  const gold = JSON.parse(readFileSync(GOLD_PATH, 'utf8')) as Gold
  const items = readItems().filter((i) => !i.duplicateOf)
  const results = JSON.parse(readFileSync(resultsPath, 'utf8')) as ItemResult[]

  const known = new Set(items.map((i) => i.id))
  const strays = [...Object.keys(gold.items), ...gold.queries.flatMap((q) => q.relevant)].filter(
    (id) => !known.has(id)
  )
  if (strays.length > 0)
    throw new Error(`gold.json names ids not in items.json: ${[...new Set(strays)].join(', ')}`)

  const repeats = [...new Set(results.map((r) => r.repeat))].sort((a, b) => a - b)
  const passes = repeats.map((repeat) => {
    const byId = new Map(results.filter((r) => r.repeat === repeat).map((r) => [r.id, r]))
    const missing = items.filter((i) => !byId.has(i.id)).map((i) => i.id)
    const scores = searchAll(
      gold,
      items.map((i) => indexedFor(i, byId.get(i.id)))
    )
    return { repeat, byId, missing, scores, headline: headline(scores) }
  })
  const first = passes[0]!

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
        tags: await snap(g.tags)
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
    scoredAt: new Date().toISOString(),
    repeats: repeats.length,
    headline: meanHeadline(passes.map((p) => p.headline)),
    perRepeat: passes.map((p) => ({ repeat: p.repeat, ...p.headline })),
    ceiling,
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
        find: rates[item.id] ?? null,
        format: formats.get(item.id) ?? null
      }
    })
  }
  writeJson(join(dir, 'score.json'), score)
  writeFileSync(join(dir, 'score.md'), markdown(score))

  console.log(`${model} · ${version} · ${gold.queries.length} queries · ${repeats.length} pass(es)`)
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
  console.log(`Wrote ${join(dir, 'score.json')} and score.md`)
}

function markdown(s: {
  model: string
  prompt: string
  repeats: number
  headline: Headline
  ceiling: Headline
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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
