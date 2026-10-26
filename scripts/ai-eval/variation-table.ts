/**
 * Round 4's variation words, every run in one table: each `variation.ts` results.json judged again
 * against the current `round4/variations.json`, so a gold fix needs no new run.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/variation-table.ts [--others]
 *
 * `--others` lists every answer that is neither right nor a "same" call, to read by eye.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runDir } from './eval-files'
import { judge, type GoldVariation } from './variation-score'

const MODELS = ['apple', 'qwen3-vl-4b', 'qwen3.5-9b']
const HOWS = ['pair', 'pile', 'pilebase', 'pilebase2', 'pilebase3']

interface Result {
  id: string
  pile: string
  top: boolean
  said: string | null
  ms: number
}

const gold = (JSON.parse(readFileSync(join(import.meta.dirname, 'round4', 'variations.json'), 'utf8')) as { items: Record<string, GoldVariation> }).items
const others: string[] = []
console.log('| Run | Right | Tops | Variants | "Same", slight difference | "Same", wrong | Other | Failed | Told apart | ms per mockup |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const model of MODELS) {
  for (const how of HOWS) {
    const path = join(runDir(model, `variation-${how}`), 'results.json')
    if (!existsSync(path)) continue
    const results = JSON.parse(readFileSync(path, 'utf8')) as Result[]
    const judged = results.map((r) => ({ ...r, g: gold[r.id]!, verdict: r.said === null ? null : judge(r.said, gold[r.id]!) }))
    const n = judged.length
    const right = judged.filter((r) => r.verdict === 'right')
    const sameSlight = judged.filter((r) => r.verdict === 'same' && r.g.subtle).length
    const sameWrong = judged.filter((r) => r.verdict === 'same' && !r.g.subtle).length
    const other = judged.filter((r) => r.verdict === 'other')
    const failed = judged.filter((r) => r.verdict === null).length
    // Piles where every mockup got its own words: what the variation is for.
    const piles = [...new Set(judged.map((r) => r.pile))]
    const apart = piles.filter((p) => {
      const said = judged.filter((r) => r.pile === p).map((r) => r.said?.toLowerCase().trim() ?? '')
      return said.every((s) => s !== '') && new Set(said).size === said.length
    }).length
    const tops = judged.filter((r) => r.top)
    const ms = Math.round(judged.reduce((t, r) => t + r.ms, 0) / n)
    console.log(
      `| ${model} · ${how} | ${right.length} of ${n} | ${right.filter((r) => r.top).length} of ${tops.length} | ${right.filter((r) => !r.top).length} of ${n - tops.length} | ${sameSlight} | ${sameWrong} | ${other.length} | ${failed} | ${apart} of ${piles.length} piles | ${ms} |`
    )
    for (const r of other) others.push(`${model} · ${how}  ${r.id}${r.top ? ' (top)' : ''}: "${r.said}" [I'd say ${r.g.say}]`)
  }
}
if (process.argv.includes('--others')) console.log(`\n${others.join('\n')}`)
