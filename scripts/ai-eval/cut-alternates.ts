/**
 * Round 4, Apple's code cut, measured without a model: a run's answers with every bad "also called"
 * name cut from the description (`withoutBadAlternate`), written as `<version>-cut` beside it. Score
 * it like any run.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/cut-alternates.ts --model apple --prompt ap-10s-strip
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argValue, runDir, writeJson } from './eval-files'
import { withoutBadAlternate } from './placeholder'
import type { ItemResult } from './run'

const model = argValue('model')
const version = argValue('prompt')
if (!model || !version) throw new Error('Usage: cut-alternates.ts --model <id> --prompt <version>')
const from = runDir(model, version)
const results = JSON.parse(readFileSync(join(from, 'results.json'), 'utf8')) as ItemResult[]
let changed = 0
const out = results.map((r) => {
  if (!r.parsed) return r
  const parsed = withoutBadAlternate(r.parsed)
  if (parsed.description !== r.parsed.description) changed++
  return { ...r, parsed }
})
const to = runDir(model, `${version}-cut`)
writeJson(join(to, 'results.json'), out)
if (existsSync(join(from, 'run.json'))) copyFileSync(join(from, 'run.json'), join(to, 'run.json'))
console.log(`${changed} of ${results.length} answers changed. Wrote ${to}`)
