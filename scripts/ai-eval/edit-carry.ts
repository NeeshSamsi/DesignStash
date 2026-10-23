/**
 * ai-eval:edit-carry. Experiment C of round 3 (design/research/ai-round3.md): when a person edits a
 * pile top's description or tags, should the edit go to each variant as it is, adapted, or not at
 * all? The model sees the variant's cover, its current suggestion and the top's before and after,
 * and answers `{decision: apply|adapt|keep, description, tags}`.
 *
 *   pnpm ai-eval:edit-carry --model qwen3-vl-4b --drafts ck-3s [--mask soft] [--prompt c1]
 *
 * The edits are `round3/edits.json`. Each case is one edit and one variant of its pile; its label
 * comes from gold, never by hand: keep when the variant's gold doesn't share the edited fact,
 * apply when the variant's gold is the top's word for word, adapt otherwise. The variant's current
 * suggestion is its pass-0 answer in `runs/<model>/<drafts>/`. Writes
 * `runs/<model>/edit-carry-<prompt>/results.json` and prints accuracy, the confusion table and
 * the time per variant.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LlamaServer, defaultLlamaServerDeps } from '../../src/main/ai/llama-server'
import { MODEL_SERVER_ARGS, resolveLlamaServerPath } from '../../src/main/ai/provider-factory'
import { MODEL_FILE_NAMES } from '../../src/main/ai/registry'
import { readCoverAsDataUrl } from '../../src/main/ai/vision-provider'
import { NativeHelper, resolveHelperPath } from '../../src/main/native/helper'
import { DEV_DIR, argValue, readItems, runDir, writeJson } from './eval-files'
import { maskedCoverPath, type MaskStyle } from './prompts/masked'
import { piles } from './prompts/pile'
import type { ItemResult } from './run'

type Decision = 'apply' | 'adapt' | 'keep'

interface Edit {
  id: string
  pile: string
  kind: string
  before: { description: string; tags: string[] }
  after: { description: string; tags: string[] }
  /** Regex for the edited fact; a leading "!" means the fact is that the pattern is absent. */
  fact: string
}

interface GoldItem {
  title: string
  description: string
  tags: { category: string; label: string }[]
}

const DECISIONS: Decision[] = ['apply', 'adapt', 'keep']

export function labelFor(edit: Edit, top: GoldItem, variant: GoldItem): Decision {
  const text = [variant.title, variant.description, ...variant.tags.map((t) => t.label)].join('\n')
  const negate = edit.fact.startsWith('!')
  const found = new RegExp(negate ? edit.fact.slice(1) : edit.fact, 'i').test(text)
  if (negate === found) return 'keep'
  const same =
    variant.description === top.description &&
    variant.tags.map((t) => t.label).join('|') === top.tags.map((t) => t.label).join('|')
  return same ? 'apply' : 'adapt'
}

const SYSTEM =
  "You help keep a designer's mockup library consistent. A pile holds variants of one mockup (other angles, colours or scenes). You decide whether an edit the designer made to the first mockup's catalogue entry should also go to another mockup in the pile. Write in English."

const PROMPTS: Record<string, (e: Edit, draft: { description: string; tags: string[] }) => string> = {
  c1: (e, d) =>
    [
      'The image above is another mockup in the pile (a variant).',
      '',
      "The designer edited the first mockup's entry.",
      `Before: "${e.before.description}" Tags: ${e.before.tags.join(', ')}.`,
      `After: "${e.after.description}" Tags: ${e.after.tags.join(', ')}.`,
      '',
      `This variant's entry now: "${d.description}" Tags: ${d.tags.join(', ')}.`,
      '',
      'Work out what the edit changed, then look at the image and decide:',
      "- apply: this variant shows the same thing in the same scene, so the edited entry fits it word for word. Give the edited description and tags.",
      "- adapt: what the edit changed is also true of this variant, but its scene, angle or contents differ. Give this variant's entry with the same change made, and nothing else changed.",
      "- keep: what the edit changed is not true of this variant (another surface, scene, colour, state or device). Give this variant's entry unchanged.",
      'Reply with JSON: decision, description, tags.'
    ].join('\n')
}

const SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: DECISIONS },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 8 }
  },
  required: ['decision', 'description', 'tags']
}

async function main(): Promise<void> {
  const model = argValue('model')
  const drafts = argValue('drafts')
  const promptId = argValue('prompt') ?? 'c1'
  const mask = argValue('mask') as MaskStyle | undefined
  if (!model || !drafts) throw new Error('Usage: pnpm ai-eval:edit-carry --model <id> --drafts <version> [--mask grey|soft] [--prompt c1]')
  const prompt = PROMPTS[promptId]
  if (!prompt) throw new Error(`No prompt ${promptId}`)
  const edits = (JSON.parse(readFileSync(join(import.meta.dirname, 'round3', 'edits.json'), 'utf8')) as { edits: Edit[] }).edits
  const gold: Record<string, GoldItem> = {}
  for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json'])
    Object.assign(gold, (JSON.parse(readFileSync(join(import.meta.dirname, f), 'utf8')) as { items: Record<string, GoldItem> }).items)
  const items = new Map(readItems().map((i) => [i.id, i]))
  const draftResults = JSON.parse(readFileSync(join(runDir(model, drafts), 'results.json'), 'utf8')) as ItemResult[]
  const draftOf = (id: string) => {
    const r = draftResults.find((x) => x.id === id && x.repeat === 0)
    if (!r?.parsed) throw new Error(`No ${drafts} answer for ${id}`)
    return { description: r.parsed.description, tags: r.searchTags.map((t) => t.label) }
  }

  const cases = edits.flatMap((edit) => {
    const pile = piles().find((p) => p.top === edit.pile)
    if (!pile) throw new Error(`${edit.id}: no pile with top ${edit.pile}`)
    return pile.variants.map((v) => ({ edit, variant: v, label: labelFor(edit, gold[edit.pile]!, gold[v]!) }))
  })

  let ask: (imagePath: string, text: string) => Promise<string>
  let stop: () => Promise<void>
  if (model === 'apple') {
    const helper = new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 5_000 })
    ask = async (imagePath, text) =>
      (await helper.describe({ imagePath, instructions: SYSTEM, prompt: text, schema: SCHEMA, maxTokens: 400 })).text
    stop = async () => {}
  } else {
    const modelDir = join(DEV_DIR, 'models', model)
    const binaryPath = resolveLlamaServerPath(process.env, undefined)
    if (!binaryPath || !existsSync(join(modelDir, MODEL_FILE_NAMES.model))) throw new Error(`No llama-server or model files for ${model}`)
    const server = new LlamaServer(
      { binaryPath, modelPath: join(modelDir, MODEL_FILE_NAMES.model), mmprojPath: join(modelDir, MODEL_FILE_NAMES.mmproj), extraArgs: MODEL_SERVER_ARGS[model] ?? [] },
      defaultLlamaServerDeps
    )
    ask = async (imagePath, text) => {
      const url = await readCoverAsDataUrl(imagePath)
      const json = (await server.complete({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [...(url ? [{ type: 'image_url', image_url: { url } }] : []), { type: 'text', text }] }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'carry', schema: SCHEMA } },
        temperature: 0,
        max_tokens: 400,
        seed: 42
      })) as { choices: { message: { content: string } }[] }
      return json.choices[0]!.message.content
    }
    stop = () => server.stop()
  }

  const results: { edit: string; kind: string; variant: string; label: Decision; decision: Decision | null; description?: string; tags?: string[]; ms: number; error?: string }[] = []
  try {
    for (const c of cases) {
      const item = items.get(c.variant)!
      const imagePath = mask ? await maskedCoverPath(item.coverPath, mask) : item.coverPath
      const started = performance.now()
      try {
        const raw = await ask(imagePath, prompt(c.edit, draftOf(c.variant)))
        const parsed = JSON.parse(raw) as { decision: Decision; description: string; tags: string[] }
        results.push({ edit: c.edit.id, kind: c.edit.kind, variant: c.variant, label: c.label, decision: parsed.decision, description: parsed.description, tags: parsed.tags, ms: Math.round(performance.now() - started) })
      } catch (err) {
        results.push({ edit: c.edit.id, kind: c.edit.kind, variant: c.variant, label: c.label, decision: null, ms: Math.round(performance.now() - started), error: (err as Error).message })
      }
      const r = results.at(-1)!
      console.log(`${String(r.ms).padStart(6)}ms  ${r.edit.padEnd(16)} ${r.variant.slice(0, 30).padEnd(31)} label ${r.label.padEnd(5)} said ${r.decision ?? 'FAILED'}`)
    }
  } finally {
    await stop()
  }

  const out = join(runDir(model, `edit-carry-${promptId}${mask ? `-${mask}` : ''}`), 'results.json')
  writeJson(out, results)
  const n = results.length
  const right = results.filter((r) => r.decision === r.label).length
  const carry = (d: Decision | null) => (d === null ? null : d !== 'keep')
  const rightBinary = results.filter((r) => carry(r.decision) === carry(r.label)).length
  const alwaysCopy = results.filter((r) => r.label !== 'keep').length
  console.log(`\n${n} cases. Exact decision right: ${right} (${((right / n) * 100).toFixed(1)}%). Carry or keep right: ${rightBinary} (${((rightBinary / n) * 100).toFixed(1)}%).`)
  console.log(`Today's rule (copy to every untouched variant) is right on carry or keep for ${alwaysCopy} (${((alwaysCopy / n) * 100).toFixed(1)}%).`)
  console.log('label \\ said: apply adapt keep failed')
  for (const l of DECISIONS)
    console.log(`${l.padEnd(6)} ${[...DECISIONS, null].map((d) => results.filter((r) => r.label === l && r.decision === d).length).join(' ')}`)
  console.log(`Mean ${Math.round(results.reduce((t, r) => t + r.ms, 0) / n)} ms per variant. Wrote ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
