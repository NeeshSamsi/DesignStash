/**
 * ai-eval:pile-score. Experiment B of round 3 (design/research/ai-round3.md): pile variants analysed
 * alone against variants given their top's suggestion as a reference.
 *
 *   pnpm ai-eval:pile-score --model qwen3-vl-4b --alone ck-6lr --with b-4b [--with b-4b-own]
 *
 * `--alone` is the base version's own run (its variant answers are the "alone" ones); each `--with`
 * is a pile run made with `--only` the variants. For each, over the variants and every pass:
 * - invented: share of answers with a gold `absent` word; tag support; placeholder mentions;
 * - consistency with the top: tag-label overlap (Jaccard) and the share of the top's title words
 *   the variant's title keeps;
 * - copied: words in the variant's answer that are in its top's answer but not in its own gold
 *   (`supportWords`), the scene details a reference can wrongly carry over, with the worst cases.
 * It also writes `runs/<model>/<with>-merged/results.json` (the base run with the variants' answers
 * swapped in), so `ai-eval:table <model>/<with>-merged` scores the searches.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILLER } from './scoring'
import { absentWords, compileAbsent, labelSupported, supportWords, type GoldEntry } from './hallucination'
import { argValue, goldPath, runDir, writeJson } from './eval-files'
import { placeholderWords, type PlaceholderData } from './placeholder'
import { piles } from './prompts/pile'
import type { ItemResult } from './run'
import { singular } from '../../src/main/db/repositories/search'

const model = argValue('model')
const alone = argValue('alone')
const withs = process.argv.flatMap((a, i) => (a === '--with' ? [process.argv[i + 1]!] : []))
if (!model || !alone || withs.length === 0) throw new Error('Usage: pnpm ai-eval:pile-score --model <id> --alone <version> --with <pile version> [--with …]')

const gold: Record<string, GoldEntry> = {}
for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json'] as const)
  Object.assign(gold, (JSON.parse(readFileSync(goldPath(f), 'utf8')) as { items: Record<string, GoldEntry> }).items)
const ph = JSON.parse(readFileSync(join(import.meta.dirname, 'placeholders.json'), 'utf8')) as PlaceholderData
const ps = piles()
const topOf = new Map(ps.flatMap((p) => p.variants.map((v) => [v, p.top] as const)))
const read = (version: string) => JSON.parse(readFileSync(join(runDir(model, version), 'results.json'), 'utf8')) as ItemResult[]

const STOP = new Set([...FILLER, 'a', 'an', 'the', 'and', 'or', 'of', 'on', 'in', 'with', 'by', 'for', 'to', 'its', 'it', 'is', 'as', 'at', 'from', 'one', 'two', 'three', 'also', 'called', 'set', 'against', 'into'])
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => singular(w))
  )
const answerText = (r: ItemResult) => [r.parsed!.title, r.parsed!.description, ...r.searchTags.map((t) => t.label)].join(' ')
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 1 : inter / union
}

const base = read(alone)
const topAnswer = (topId: string, repeat: number) => base.find((r) => r.id === topId && r.repeat === repeat) ?? base.find((r) => r.id === topId)

function measure(name: string, answers: ItemResult[]) {
  const rows = answers.filter((r) => topOf.has(r.id) && r.parsed)
  let invented = 0
  let labels = 0
  let supported = 0
  let placeholder = 0
  let tagJ = 0
  let titleKept = 0
  const copied: { id: string; repeat: number; words: string[] }[] = []
  for (const r of rows) {
    const g = gold[r.id]!
    const labelsOf = r.searchTags.map((t) => t.label)
    const text = [r.parsed!.title, r.parsed!.description, ...labelsOf].join('\n|\n')
    if (g.absent && absentWords(text, compileAbsent(g.absent)).length > 0) invented++
    const support = supportWords(g)
    for (const l of labelsOf) {
      const ok = labelSupported(l, support)
      if (ok === null) continue
      labels++
      if (ok) supported++
    }
    if (ph.items[r.id] && placeholderWords(r.parsed!, labelsOf, ph.items[r.id]!, ph.generic).length > 0) placeholder++
    const top = topAnswer(topOf.get(r.id)!, r.repeat)
    if (top?.parsed) {
      tagJ += jaccard(new Set(labelsOf.map((l) => l.toLowerCase())), new Set(top.searchTags.map((t) => t.label.toLowerCase())))
      const topTitle = words(top.parsed.title)
      const mine = words(r.parsed!.title)
      titleKept += topTitle.size === 0 ? 1 : [...topTitle].filter((w) => mine.has(w)).length / topTitle.size
      const fromTop = words(answerText(top))
      const own = words(answerText(r))
      const c = [...own].filter((w) => fromTop.has(w) && !support.has(w))
      if (c.length > 0) copied.push({ id: r.id, repeat: r.repeat, words: c })
    }
  }
  const n = rows.length
  const pct = (x: number) => `${((x / Math.max(n, 1)) * 100).toFixed(1)}%`
  return {
    name,
    answers: n,
    invented: pct(invented),
    tagSupport: `${((supported / Math.max(labels, 1)) * 100).toFixed(1)}%`,
    placeholder: pct(placeholder),
    tagOverlap: (tagJ / Math.max(n, 1)).toFixed(2),
    titleKept: (titleKept / Math.max(n, 1)).toFixed(2),
    copiedAnswers: pct(copied.length),
    copiedWords: (copied.reduce((t, c) => t + c.words.length, 0) / Math.max(n, 1)).toFixed(2),
    copied
  }
}

const results = [measure(`${alone} (alone)`, base), ...withs.map((w) => measure(w, read(w)))]
console.log('| Run | Answers | Invented | Tag support | Placeholder | Tag overlap with top | Top title words kept | Answers with copied words | Copied words per answer |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const r of results)
  console.log(`| ${r.name} | ${r.answers} | ${r.invented} | ${r.tagSupport} | ${r.placeholder} | ${r.tagOverlap} | ${r.titleKept} | ${r.copiedAnswers} | ${r.copiedWords} |`)
for (const r of results) {
  const counts = new Map<string, number>()
  for (const c of r.copied) for (const w of c.words) counts.set(`${c.id.slice(0, 24)}: ${w}`, (counts.get(`${c.id.slice(0, 24)}: ${w}`) ?? 0) + 1)
  console.log(`\n${r.name} copied: ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k} ×${v}`).join('; ') || 'none'}`)
}
for (const w of withs) {
  const swapped = read(w)
  const merged = [...base.filter((b) => !swapped.some((s) => s.id === b.id && s.repeat === b.repeat)), ...swapped]
  writeJson(join(runDir(model, `${w}-merged`), 'results.json'), merged)
}
