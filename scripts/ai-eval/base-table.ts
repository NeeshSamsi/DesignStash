/**
 * Round 4 B, the pile's base title: today's base (the top's own suggested title, as the app names
 * the pile) against the base the pile request gives (`variation.ts --how pilebase`), each judged
 * against `round4/bases.json`: it fits when it names the object and nothing only some mockups have.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/base-table.ts [--today qwen3-vl-4b=sp-base-strip,qwen3.5-9b=ck-9d-merged-strip]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startWithCapital, withoutObjectColours } from '../../src/main/ai/object-colour'
import { JUNK_WORDS } from '../../src/main/ai/vision-provider'
import { argValue, runDir } from './eval-files'
import { piles } from './prompts/pile'

interface BaseGold {
  say: string
  object: string[]
  absent: string[]
}

const gold = (JSON.parse(readFileSync(join(import.meta.dirname, 'round4', 'bases.json'), 'utf8')) as { items: Record<string, BaseGold> }).items
const today = Object.fromEntries(
  (argValue('today') ?? 'qwen3-vl-4b=sp-base-strip,qwen3.5-9b=ck-9d-merged-strip').split(',').map((pair) => pair.split('=') as [string, string])
)

/** A base as the app would keep it: quoted print, stock words (free, mockup, PSD) and object colours cut. */
export function cleaned(base: string | null): string | null {
  if (!base) return null
  const text = startWithCapital(base.replace(/'[^']+'/g, '').replace(JUNK_WORDS, '').replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim())
  return withoutObjectColours({ title: text, description: '', tags: [] }).title || null
}

/** Never in a base, whatever the pile: words for the pile itself. */
const GENERIC = /\bvariants?\b|\bvariations?\b/i

/** Whether a base fits its pile: it names the object, and nothing in `absent`. The first `absent` word it has, if any. */
export function fits(base: string | null, g: BaseGold): { fits: boolean; why: string } {
  if (!base) return { fits: false, why: 'none' }
  if (GENERIC.test(base)) return { fits: false, why: base.match(GENERIC)![0] }
  if (!g.object.some((o) => new RegExp(o, 'i').test(base))) return { fits: false, why: 'no object' }
  const wrong = g.absent.find((a) => new RegExp(a, 'i').test(base))
  return wrong ? { fits: false, why: base.match(new RegExp(wrong, 'i'))![0] } : { fits: true, why: '' }
}

for (const [model, run] of Object.entries(today)) {
  const results = JSON.parse(readFileSync(join(runDir(model, run), 'results.json'), 'utf8')) as { id: string; repeat?: number; parsed: { title: string } | null }[]
  const titleOf = new Map(results.filter((r) => (r.repeat ?? 0) === 0).map((r) => [r.id, r.parsed?.title ?? null]))
  const hows = ['pilebase', 'pilebase2', 'pilebase3'].filter((h) => existsSync(join(runDir(model, `variation-${h}`), 'bases.json')))
  const asked = Object.fromEntries(hows.map((h) => [h, JSON.parse(readFileSync(join(runDir(model, `variation-${h}`), 'bases.json'), 'utf8')) as Record<string, string | null>]))
  const fitting: Record<string, number> = { today: 0, ...Object.fromEntries(hows.map((h) => [h, 0])) }
  const verdict = (base: string | null, g: BaseGold, key: string) => {
    const f = fits(base, g)
    if (f.fits) fitting[key]!++
    return `${base ?? '-'} (${f.fits ? 'fits' : `no: ${f.why}`})`
  }
  console.log(`\n${model} (today: ${run}; every base cleaned as the app cleans a title)\n| Pile | I'd say | Today | ${hows.join(' | ')} |\n|---|---|---|${hows.map(() => '---|').join('')}`)
  for (const p of piles()) {
    const g = gold[p.top]!
    const cells = [verdict(cleaned(titleOf.get(p.top) ?? null), g, 'today'), ...hows.map((h) => verdict(cleaned(asked[h]![p.top] ?? null), g, h))]
    console.log(`| ${p.top.slice(0, 28)} | ${g.say} | ${cells.join(' | ')} |`)
  }
  console.log(`Fits, of 12: ${Object.entries(fitting).map(([k, n]) => `${k} ${n}`).join(', ')}`)
}
