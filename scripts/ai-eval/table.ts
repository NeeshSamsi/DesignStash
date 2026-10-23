/**
 * ai-eval:table. Scores runs on the tuning, held-out and sign-off sets and prints one row per run:
 * found / right (recall / precision of the gold searches), invention rate, placeholder mentions,
 * bad "also called" names and the mean time per mockup (these two over every answer in the run). Held-out and sign-off rows score those
 * items' own answers for inventions and placeholders; their searches include the tuning items, as
 * `ai-eval:score --held-out` does.
 *
 *   pnpm ai-eval:table qwen3-vl-4b/ck-2 qwen3-vl-4b/ck-3m apple/ap-6
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HELD_OUT_DIR, SIGN_OFF_DIR, readItems, runDir } from './eval-files'
import { badAlternate } from './placeholder'
import type { ItemResult } from './run'

const SETS = [
  { name: 'tuning', flag: [] as string[], file: 'score.json' },
  { name: 'held-out', flag: ['--held-out'], file: 'score-heldout.json' },
  { name: 'sign-off', flag: ['--sign-off'], file: 'score-signoff.json' }
]

interface Score {
  headline: { recall: number; precision: number }
  absentFound: { id: string; repeat: number }[]
  placeholderFound: { id: string; repeat: number; words: string[] }[]
  badAlternates: { rate: number }
  meanMs: number
  repeats: number
  items: { id: string }[]
}

const items = readItems().filter((i) => !i.duplicateOf)
const placeholders = JSON.parse(readFileSync(join(import.meta.dirname, 'placeholders.json'), 'utf8')) as { items: Record<string, unknown> }
const gold = (f: string) => JSON.parse(readFileSync(join(import.meta.dirname, f), 'utf8')) as { items: Record<string, { absent?: string[] }> }
const golds = { tuning: gold('gold.json'), 'held-out': gold('gold-heldout.json'), 'sign-off': gold('gold-signoff.json') }
const subset = (name: string) =>
  items.filter((i) =>
    name === 'held-out' ? i.source.path.includes(`/${HELD_OUT_DIR}/`) : name === 'sign-off' ? i.source.path.includes(`/${SIGN_OFF_DIR}/`) : !i.source.path.includes(`/${HELD_OUT_DIR}/`) && !i.source.path.includes(`/${SIGN_OFF_DIR}/`)
  ).map((i) => i.id)

const pct = (n: number) => (n * 100).toFixed(1)
console.log('| Run | Set | Found / right | Invented | Placeholder | Bad "also called" | ms per mockup |')
console.log('|---|---|---|---|---|---|---|')
for (const arg of process.argv.slice(2)) {
  const [model, prompt] = arg.split('/') as [string, string]
  // Over every answer in the run, all three sets.
  const results = JSON.parse(readFileSync(join(runDir(model, prompt), 'results.json'), 'utf8')) as ItemResult[]
  const answered = results.filter((r) => r.parsed)
  const bad = answered.filter((r) => badAlternate(r.parsed!.description)).length / Math.max(answered.length, 1)
  const ms = Math.round(results.reduce((t, r) => t + r.elapsedMs, 0) / Math.max(results.length, 1))
  for (const set of SETS) {
    const out = spawnSync('pnpm', ['-s', 'ai-eval:score', '--model', model, '--prompt', prompt, ...set.flag], { encoding: 'utf8' })
    if (out.status !== 0) throw new Error(out.stderr || out.stdout)
    const s = JSON.parse(readFileSync(join(runDir(model, prompt), set.file), 'utf8')) as Score
    const ids = new Set(subset(set.name))
    const g = golds[set.name as keyof typeof golds]
    const absentAnswers = [...ids].filter((id) => g.items[id]?.absent).length * s.repeats
    const invented = new Set(s.absentFound.filter((a) => ids.has(a.id)).map((a) => `${a.id}#${a.repeat}`)).size
    const phAnswers = [...ids].filter((id) => placeholders.items[id]).length * s.repeats
    const ph = new Set(s.placeholderFound.filter((a) => ids.has(a.id)).map((a) => `${a.id}#${a.repeat}`)).size
    console.log(
      `| ${arg} | ${set.name} | ${pct(s.headline.recall)} / ${pct(s.headline.precision)} | ${pct(invented / Math.max(absentAnswers, 1))}% | ${pct(ph / Math.max(phAnswers, 1))}% (${ph}/${phAnswers}) | ${set.name === 'tuning' ? `${pct(bad)}%` : ''} | ${set.name === 'tuning' ? ms : ''} |`
    )
  }
}
