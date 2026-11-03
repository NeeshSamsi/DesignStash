/**
 * ai-eval:edit-carry-score. Experiment C of round 3 (design/research/ai-round3.md): what each variant
 * ends with after an edit run, scored on the edited fact.
 *
 *   pnpm ai-eval:edit-carry-score --model qwen3.5-9b --drafts ck-9d-merged --run edit-carry-c3
 *   pnpm ai-eval:edit-carry-score --model apple --drafts ap-10s --run today --cases edit-carry-c1-soft
 *   pnpm ai-eval:edit-carry-score --model qwen3.5-9b --drafts ck-9d-merged --run edit-carry-accept --tags changes
 *
 * The final entry is the variant's draft (its pass-0 answer in `--drafts`) when the run says keep,
 * as the app would leave it, else the run's description and tags. `--run today` scores the app's
 * rule (`carriedEdit`: the top's edited entry copied to every untouched variant) and `--run never`
 * carries nothing, both over the cases of `--cases`. `--tags` sets a carried variant's tags:
 * `run` (default) as the run gave them, `copy` the top's edited tags, `changes` the variant's own
 * with only the edit's tag changes made (added tags added, removed tags taken out). Per case:
 * - right: for keep, the edited fact did not arrive; for apply or adapt, it is there (`Edit.fact`);
 * - own details: words of the variant's draft that its gold has too and the edit did not take out;
 *   kept is the share of them still in the final entry;
 * - brought in: words of the top's edited entry in neither the variant's draft, its gold nor what
 *   the edit added (a word check, so "rests" or "light" can count when the scene around them is wrong).
 * Apply and adapt cases are summed apart from keep cases, which a person may accept anyway.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argValue, goldPath, runDir } from './eval-files'
import type { ItemResult } from './run'

interface Edit {
  id: string
  before: { description: string; tags: string[] }
  after: { description: string; tags: string[] }
  fact: string
}

interface Case {
  edit: string
  variant: string
  label: 'apply' | 'adapt' | 'keep'
  decision: 'apply' | 'adapt' | 'keep' | null
  description?: string
  tags?: string[]
  ms?: number
  error?: string
}

interface GoldItem {
  title: string
  description: string
  tags: { label: string }[]
}

const model = argValue('model')
const drafts = argValue('drafts')
const run = argValue('run')
const tagsFrom = argValue('tags') ?? 'run'
if (!model || !drafts || !run || !['run', 'copy', 'changes'].includes(tagsFrom))
  throw new Error('Usage: pnpm ai-eval:edit-carry-score --model <id> --drafts <version> --run <edit-carry run|today|never> [--cases <edit-carry run>] [--tags run|copy|changes]')

const read = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T
const edits = new Map(read<{ edits: Edit[] }>(join(import.meta.dirname, 'round3', 'edits.json')).edits.map((e) => [e.id, e]))
const gold: Record<string, GoldItem> = {}
for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json'] as const) Object.assign(gold, read<{ items: Record<string, GoldItem> }>(goldPath(f)).items)
const draftRuns = read<ItemResult[]>(join(runDir(model, drafts), 'results.json'))
const draftEntry = (id: string) => {
  const r = draftRuns.find((x) => x.id === id && x.repeat === 0)
  if (!r?.parsed) throw new Error(`No ${drafts} answer for ${id}`)
  return { description: r.parsed.description, tags: r.searchTags.map((t) => t.label) }
}
const draftOf = (id: string) => {
  const d = draftEntry(id)
  return [d.description, ...d.tags].join('\n')
}

const casesFrom = (name: string) => read<Case[]>(join(runDir(model, name), 'results.json'))
const cases: Case[] =
  run === 'today'
    ? casesFrom(argValue('cases') ?? 'edit-carry-c1').map((c) => ({ ...c, decision: 'apply', description: edits.get(c.edit)!.after.description, tags: edits.get(c.edit)!.after.tags }))
    : run === 'never'
      ? casesFrom(argValue('cases') ?? 'edit-carry-c1').map((c) => ({ ...c, decision: 'keep' }))
      : casesFrom(run)

/** The variant's own tags with only the edit's tag changes made. */
function changedTags(e: Edit, own: string[]): string[] {
  const has = (list: string[], t: string) => list.some((x) => x.toLowerCase() === t.toLowerCase())
  const added = e.after.tags.filter((t) => !has(e.before.tags, t))
  const removed = e.before.tags.filter((t) => !has(e.after.tags, t))
  const kept = own.filter((t) => !has(removed, t))
  return [...kept, ...added.filter((t) => !has(kept, t))]
}

const holds = (fact: string, text: string) => (fact.startsWith('!') ? !new RegExp(fact.slice(1), 'i').test(text) : new RegExp(fact, 'i').test(text))
const STOP = new Set(['the', 'and', 'with', 'also', 'called', 'its', 'for', 'one', 'two', 'three', 'that', 'whose', 'which', 'from', 'into', 'onto', 'this', 'are', 'has'])
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}-]+/u)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/s$/, ''))
  )

let right = 0
let clean = 0
let carried = 0
let overwrote = 0
const wrong: string[] = []
const brought: string[] = []
const byLabel: Record<string, [number, number]> = {}
// Per group (apply and adapt, or keep): cases, right, right and clean, fact there, description as it was,
// own details and kept, cases losing any, bringing any in.
type Group = { n: number; right: number; clean: number; fact: number; unchanged: number; own: number; kept: number; losing: number; bringing: number }
const groups: Record<string, Group> = {}
const lost: string[] = []
for (const c of cases) {
  const e = edits.get(c.edit)!
  const before = draftOf(c.variant)
  const tags = tagsFrom === 'copy' ? e.after.tags : tagsFrom === 'changes' ? changedTags(e, draftEntry(c.variant).tags) : (c.tags ?? [])
  const final = c.decision === 'keep' || !c.decision ? before : [c.description ?? '', ...tags].join('\n')
  // A keep case whose fact is a lookahead ("not an open book") can only be judged by the decision.
  const ok =
    c.label === 'keep' ? (e.fact.startsWith('^(?!') ? c.decision === 'keep' : !(holds(e.fact, final) && !holds(e.fact, before))) : holds(e.fact, final)
  let extra: string[] = []
  if (c.decision && c.decision !== 'keep') {
    carried++
    if (c.label === 'adapt' && c.description?.trim() === e.after.description.trim()) overwrote++
    const g = gold[c.variant]!
    const own = new Set([...words(before), ...words([g.title, g.description, ...g.tags.map((t) => t.label)].join(' '))])
    const topBefore = words([e.before.description, ...e.before.tags].join(' '))
    const topAfter = words([e.after.description, ...e.after.tags].join(' '))
    // The top's words the edit kept (its scene), where the variant has no such word of its own.
    extra = [...words(final)].filter((w) => topAfter.has(w) && topBefore.has(w) && !own.has(w))
    if (extra.length > 0) brought.push(`${c.edit}/${c.variant.slice(0, 18)}: ${extra.join(', ')}`)
  }
  const g = gold[c.variant]!
  const removed = new Set([...words([e.before.description, ...e.before.tags].join(' '))].filter((w) => !words([e.after.description, ...e.after.tags].join(' ')).has(w)))
  const goldWords = words([g.title, g.description, ...g.tags.map((t) => t.label)].join(' '))
  const own = [...words(before)].filter((w) => goldWords.has(w) && !removed.has(w))
  const finalWords = words(final)
  const gone = own.filter((w) => !finalWords.has(w))
  const group = (groups[c.label === 'keep' ? 'keep' : 'apply+adapt'] ??= { n: 0, right: 0, clean: 0, fact: 0, unchanged: 0, own: 0, kept: 0, losing: 0, bringing: 0 })
  group.n++
  if (holds(e.fact, final)) group.fact++
  if (final.split('\n')[0] === before.split('\n')[0]) group.unchanged++
  group.own += own.length
  group.kept += own.length - gone.length
  if (gone.length > 0) {
    group.losing++
    lost.push(`${c.edit}/${c.variant.slice(0, 18)}: ${gone.join(', ')}`)
  }
  if (extra.length > 0) group.bringing++
  const slot = (byLabel[c.label] ??= [0, 0])
  slot[1]++
  if (ok) {
    right++
    slot[0]++
    group.right++
    if (extra.length === 0) {
      clean++
      group.clean++
    }
  } else wrong.push(`${c.edit}/${c.variant.slice(0, 22)} (${c.label} → ${c.decision ?? 'failed'})`)
}

const n = cases.length
const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`
console.log(`${model} ${run}: right ${right}/${n} (${pct(right)}); by label ${Object.entries(byLabel).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', ')}`)
console.log(`  right with nothing of the top's entry brought in: ${clean}/${n} (${pct(clean)}); carried ${carried}, ${brought.length} bringing words in; adapt cases given the top's entry word for word: ${overwrote}`)
console.log(`  wrong: ${wrong.join('; ') || 'none'}`)
console.log(`  brought in: ${brought.join('; ') || 'none'}`)
for (const [k, g] of Object.entries(groups))
  console.log(`  ${k} (${g.n}): right ${g.right}, and clean ${g.clean}; fact there ${g.fact}; description as it was ${g.unchanged}; own details kept ${g.kept}/${g.own} (${((g.kept / Math.max(g.own, 1)) * 100).toFixed(0)}%), ${g.losing} cases losing any; ${g.bringing} bringing the top's words in`)
console.log(`  own details lost: ${lost.join('; ') || 'none'}`)
const failed = cases.filter((c) => !c.decision)
const timed = cases.filter((c) => c.ms !== undefined && run !== 'today' && run !== 'never')
if (timed.length > 0) console.log(`  failed ${failed.length}${failed.length > 0 ? ` (${[...new Set(failed.map((c) => c.error))].join('; ')})` : ''}; mean ${Math.round(timed.reduce((t, c) => t + c.ms!, 0) / timed.length)} ms per variant`)
