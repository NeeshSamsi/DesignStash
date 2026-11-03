/**
 * Round 4's code fix, measured without a model: a run's answers with every object colour taken out
 * (`withoutObjectColours`), written as `<version>-strip` beside it, its tags snapped again as run.ts
 * does (one library per pass). Score it like any run.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/strip-colours.ts --model qwen3-vl-4b --prompt ck-7e-merged
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argValue, runDir, writeJson } from './eval-files'
import { withoutObjectColours } from './object-colour'
import type { ItemResult } from './run'
import { createTagSnapper } from './searchable-tags'

async function main(): Promise<void> {
  const model = argValue('model')
  const version = argValue('prompt')
  if (!model || !version) throw new Error('Usage: strip-colours.ts --model <id> --prompt <version>')
  const from = runDir(model, version)
  const results = JSON.parse(readFileSync(join(from, 'results.json'), 'utf8')) as ItemResult[]
  const snaps = new Map<number, ReturnType<typeof createTagSnapper>>()
  const out: ItemResult[] = []
  let changed = 0
  for (const r of results) {
    if (!r.parsed) {
      out.push(r)
      continue
    }
    const parsed = withoutObjectColours(r.parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(r.parsed)) changed++
    const snap = snaps.get(r.repeat) ?? createTagSnapper()
    snaps.set(r.repeat, snap)
    out.push({ ...r, parsed, searchTags: await snap(parsed.tags) })
  }
  const to = runDir(model, `${version}-strip`)
  writeJson(join(to, 'results.json'), out)
  if (existsSync(join(from, 'run.json'))) copyFileSync(join(from, 'run.json'), join(to, 'run.json'))
  console.log(`${changed} of ${results.length} answers changed. Wrote ${to}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
