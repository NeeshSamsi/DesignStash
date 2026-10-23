/**
 * ai-eval:edit-carry-score. Experiment C of round 3 (design/research/ai-round3.md): what each variant
 * ends with after an edit run, scored on the edited fact.
 *
 *   pnpm ai-eval:edit-carry-score --model qwen3.5-9b --drafts ck-9d-merged --run edit-carry-c3
 *   pnpm ai-eval:edit-carry-score --model apple --drafts ap-10s --run today --cases edit-carry-c1-soft
 *
 * The final entry is the variant's draft (its pass-0 answer in `--drafts`) when the run says keep,
 * as the app would leave it, else the run's description and tags. `--run today` scores the app's
 * rule (`carriedEdit`: the top's edited entry copied to every untouched variant) and `--run never`
 * carries nothing, both over the cases of `--cases`. Per case:
 * - right: for keep, the edited fact did not arrive; for apply or adapt, it is there (`Edit.fact`);
 * - brought in: words of the top's edited entry in neither the variant's draft, its gold nor what
 *   the edit added (a word check, so "rests" or "light" can count when the scene around them is wrong).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argValue, runDir } from './eval-files'
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
}

interface GoldItem {
  title: string
  description: string
  tags: { label: string }[]
}

const model = argValue('model')
const drafts = argValue('drafts')
const run = argValue('run')
if (!model || !drafts || !run) throw new Error('Usage: pnpm ai-eval:edit-carry-score --model <id> --drafts <version> --run <edit-carry run|today|never> [--cases <edit-carry run>]')

const read = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T
const edits = new Map(read<{ edits: Edit[] }>(join(import.meta.dirname, 'round3', 'edits.json')).edits.map((e) => [e.id, e]))
const gold: Record<string, GoldItem> = {}
for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json']) Object.assign(gold, read<{ items: Record<string, GoldItem> }>(join(import.meta.dirname, f)).items)
const draftRuns = read<ItemResult[]>(join(runDir(model, drafts), 'results.json'))
const draftOf = (id: string) => {
  const r = draftRuns.find((x) => x.id === id && x.repeat === 0)
  if (!r?.parsed) throw new Error(`No ${drafts} answer for ${id}`)
  return [r.parsed.description, ...r.searchTags.map((t) => t.label)].join('\n')
}

const casesFrom = (name: string) => read<Case[]>(join(runDir(model, name), 'results.json'))
const cases: Case[] =
  run === 'today'
    ? casesFrom(argValue('cases') ?? 'edit-carry-c1').map((c) => ({ ...c, decision: 'apply', description: edits.get(c.edit)!.after.description, tags: edits.get(c.edit)!.after.tags }))
    : run === 'never'
      ? casesFrom(argValue('cases') ?? 'edit-carry-c1').map((c) => ({ ...c, decision: 'keep' }))
      : casesFrom(run)

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
for (const c of cases) {
  const e = edits.get(c.edit)!
  const before = draftOf(c.variant)
  const final = c.decision === 'keep' || !c.decision ? before : [c.description ?? '', ...(c.tags ?? [])].join('\n')
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
  const slot = (byLabel[c.label] ??= [0, 0])
  slot[1]++
  if (ok) {
    right++
    slot[0]++
    if (extra.length === 0) clean++
  } else wrong.push(`${c.edit}/${c.variant.slice(0, 22)} (${c.label} → ${c.decision ?? 'failed'})`)
}

const n = cases.length
const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`
console.log(`${model} ${run}: right ${right}/${n} (${pct(right)}); by label ${Object.entries(byLabel).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', ')}`)
console.log(`  right with nothing of the top's entry brought in: ${clean}/${n} (${pct(clean)}); carried ${carried}, ${brought.length} bringing words in; adapt cases given the top's entry word for word: ${overwrote}`)
console.log(`  wrong: ${wrong.join('; ') || 'none'}`)
console.log(`  brought in: ${brought.join('; ') || 'none'}`)
