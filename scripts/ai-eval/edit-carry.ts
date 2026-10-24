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
 *
 * `--prompt c1` asks for the decision and the new entry in one reply. `--prompt c2` splits it: the
 * words the edit added and took out are found in code; once per edit the model turns what was
 * added into one yes/no question; each variant's cover is asked that question, and only on a yes is
 * the variant's own entry given the change. An edit that only takes words out needs no question: it
 * goes to every variant whose entry has those words. `--prompt c3` is c2 with no question: each
 * cover is asked about the edit itself, told the words it added. `--prompt accept` is what happens
 * when the person accepts the edit on a variant: no check, every case gets c3's change (or the
 * removal) in a text request; `ai-eval:edit-carry-score` scores it against copying the top's entry.
 * `--cases <run>` takes the edits and variants of an earlier run in place of today's piles, so a
 * change to the app's grouping leaves the set as it was.
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

const STOP = new Set(['the', 'and', 'with', 'also', 'called', 'its', 'for', 'one', 'two', 'three', 'that', 'whose', 'which', 'from', 'into', 'onto', 'this'])
const contentWords = (text: string) =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2 && !STOP.has(w)))

/** The content words an edit added and took out, over its description and tags. */
export function editDiff(e: Pick<Edit, 'before' | 'after'>): { added: string[]; removed: string[] } {
  const before = contentWords([e.before.description, ...e.before.tags].join(' '))
  const after = contentWords([e.after.description, ...e.after.tags].join(' '))
  return { added: [...after].filter((w) => !before.has(w)), removed: [...before].filter((w) => !after.has(w)) }
}

const editLines = (e: Edit) => [
  "The designer edited the catalogue entry of the first mockup in a pile.",
  `Before: "${e.before.description}" Tags: ${e.before.tags.join(', ')}.`,
  `After: "${e.after.description}" Tags: ${e.after.tags.join(', ')}.`
]

const C2 = {
  question: (e: Edit) =>
    [
      ...editLines(e),
      '',
      "Write one short yes/no question about another mockup's image, answered yes exactly when what the edit added is also true of that image (the same surface, setting, colour, state, name or detail). Ask only about what the edit added. Example: \"Does the laptop rest on a white slatted bench?\"",
      'Reply with JSON: question.'
    ].join('\n'),
  checkEdit: (e: Edit, added: string[]) =>
    [
      'The image above is another mockup in the pile.',
      ...editLines(e),
      `The edit added: ${added.join(', ')}.`,
      '',
      'Is what the edit added also true of this image (the same surface, setting, colour, state, name or detail)? Answer yes or no from what the image shows.',
      'Reply with JSON: answer.'
    ].join('\n'),
  check: (question: string) => `The image above is a design mockup. ${question} Answer yes or no from what the image shows.\nReply with JSON: answer.`,
  change: (e: Edit, d: { description: string; tags: string[] }) =>
    [
      ...editLines(e),
      '',
      `Another mockup in the pile has this entry: "${d.description}" Tags: ${d.tags.join(', ')}.`,
      'Make the same change to that entry and nothing else: keep its own setting, angle and other details, and its own words where the edit did not touch them.',
      'Reply with JSON: description, tags.'
    ].join('\n'),
  remove: (removed: string[], d: { description: string; tags: string[] }) =>
    [
      `The designer took these words out of the first mockup's entry in a pile, because they were wrong: ${removed.join(', ')}.`,
      `Another mockup in the pile has this entry: "${d.description}" Tags: ${d.tags.join(', ')}.`,
      'Take the same thing out of that entry and change nothing else. Mend any sentence the cut leaves broken.',
      'Reply with JSON: description, tags.'
    ].join('\n')
}

const QUESTION_SCHEMA = { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] }
const ANSWER_SCHEMA = { type: 'object', properties: { answer: { type: 'string', enum: ['yes', 'no'] } }, required: ['answer'] }
const ENTRY_SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' }, maxItems: 8 } },
  required: ['description', 'tags']
}

async function main(): Promise<void> {
  const model = argValue('model')
  const drafts = argValue('drafts')
  const promptId = argValue('prompt') ?? 'c1'
  const mask = argValue('mask') as MaskStyle | undefined
  if (!model || !drafts) throw new Error('Usage: pnpm ai-eval:edit-carry --model <id> --drafts <version> [--mask grey|soft] [--prompt c1]')
  const prompt = PROMPTS[promptId]
  if (!prompt && !['c2', 'c3', 'accept'].includes(promptId)) throw new Error(`No prompt ${promptId}`)
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

  const casesFrom = argValue('cases')
  const pairs = casesFrom
    ? (JSON.parse(readFileSync(join(runDir(model, casesFrom), 'results.json'), 'utf8')) as { edit: string; variant: string }[]).map((r) => ({
        edit: edits.find((e) => e.id === r.edit)!,
        variant: r.variant
      }))
    : edits.flatMap((edit) => {
        const pile = piles().find((p) => p.top === edit.pile)
        if (!pile) throw new Error(`${edit.id}: no pile with top ${edit.pile}`)
        return pile.variants.map((variant) => ({ edit, variant }))
      })
  const cases = pairs.map(({ edit, variant }) => ({ edit, variant, label: labelFor(edit, gold[edit.pile]!, gold[variant]!) }))
  // run.ts's header line, so the progress view (`progress.mjs`) draws this run too.
  console.log(`${model} · edit-carry-${promptId}${mask ? `-${mask}` : ''} · ${cases.length} items × 1`)

  let ask: (imagePath: string | null, text: string, schema?: object) => Promise<string>
  let stop: () => Promise<void>
  if (model === 'apple') {
    const helper = new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 5_000 })
    ask = async (imagePath, text, schema = SCHEMA) =>
      (await helper.describe({ imagePath, instructions: SYSTEM, prompt: text, schema, maxTokens: 400 })).text
    stop = async () => {}
  } else {
    const modelDir = join(DEV_DIR, 'models', model)
    const binaryPath = resolveLlamaServerPath(process.env, undefined)
    if (!binaryPath || !existsSync(join(modelDir, MODEL_FILE_NAMES.model))) throw new Error(`No llama-server or model files for ${model}`)
    const server = new LlamaServer(
      { binaryPath, modelPath: join(modelDir, MODEL_FILE_NAMES.model), mmprojPath: join(modelDir, MODEL_FILE_NAMES.mmproj), extraArgs: MODEL_SERVER_ARGS[model] ?? [] },
      defaultLlamaServerDeps
    )
    ask = async (imagePath, text, schema = SCHEMA) => {
      const url = imagePath ? await readCoverAsDataUrl(imagePath) : null
      const json = (await server.complete({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [...(url ? [{ type: 'image_url', image_url: { url } }] : []), { type: 'text', text }] }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'carry', schema } },
        temperature: 0,
        max_tokens: 400,
        seed: 42
      })) as { choices: { message: { content: string } }[] }
      return json.choices[0]!.message.content
    }
    stop = () => server.stop()
  }

  const results: { edit: string; kind: string; variant: string; label: Decision; decision: Decision | null; description?: string; tags?: string[]; question?: string; answer?: string; ms: number; error?: string }[] = []
  // c2: one question per edit, written once and timed apart from the variants.
  const questions = new Map<string, { question: string; ms: number }>()
  const questionFor = async (e: Edit) => {
    if (!questions.has(e.id)) {
      const started = performance.now()
      const q = (JSON.parse(await ask(null, C2.question(e), QUESTION_SCHEMA)) as { question: string }).question
      questions.set(e.id, { question: q, ms: Math.round(performance.now() - started) })
    }
    return questions.get(e.id)!
  }
  type Said = { decision: Decision; description: string; tags: string[]; question?: string; answer?: string }
  // The variant's own entry with the edit's change made, or with its removed words taken out.
  const changed = async (e: Edit, d: { description: string; tags: string[] }): Promise<Said> => {
    const { added, removed } = editDiff(e)
    if (added.length > 0) return { decision: 'adapt' as const, ...(JSON.parse(await ask(null, C2.change(e, d), ENTRY_SCHEMA)) as typeof d) }
    const has = removed.some((w) => new RegExp(`\\b${w}`, 'i').test([d.description, ...d.tags].join(' ')))
    if (!has) return { decision: 'adapt' as const, ...d }
    return { decision: 'adapt' as const, ...(JSON.parse(await ask(null, C2.remove(removed, d), ENTRY_SCHEMA)) as typeof d) }
  }
  const c2 = async (e: Edit, imagePath: string, d: { description: string; tags: string[] }): Promise<Said> => {
    const { added } = editDiff(e)
    if (added.length === 0) return changed(e, d)
    const question = promptId === 'c3' ? `added: ${added.join(', ')}` : (await questionFor(e)).question
    const text = promptId === 'c3' ? C2.checkEdit(e, added) : C2.check(question)
    const answer = (JSON.parse(await ask(imagePath, text, ANSWER_SCHEMA)) as { answer: string }).answer
    if (answer !== 'yes') return { decision: 'keep' as const, ...d, question, answer }
    return { ...(await changed(e, d)), question, answer }
  }
  try {
    for (const c of cases) {
      const item = items.get(c.variant)!
      const imagePath = mask ? await maskedCoverPath(item.coverPath, mask) : item.coverPath
      const started = performance.now()
      try {
        if (promptId === 'c2' && editDiff(c.edit).added.length > 0) await questionFor(c.edit).catch(() => null)
        const begun = promptId === 'c2' ? performance.now() : started
        const parsed = prompt
          ? (JSON.parse(await ask(imagePath, prompt(c.edit, draftOf(c.variant)))) as Said)
          : promptId === 'accept'
            ? await changed(c.edit, draftOf(c.variant))
            : await c2(c.edit, imagePath, draftOf(c.variant))
        results.push({ edit: c.edit.id, kind: c.edit.kind, variant: c.variant, label: c.label, decision: parsed.decision, description: parsed.description, tags: parsed.tags, ...(parsed.question !== undefined && { question: parsed.question }), ...(parsed.answer !== undefined && { answer: parsed.answer }), ms: Math.round(performance.now() - begun) })
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
  if (questions.size > 0) {
    const qs = [...questions.values()]
    console.log(`Questions: ${qs.length}, mean ${Math.round(qs.reduce((t, q) => t + q.ms, 0) / qs.length)} ms each.`)
    for (const [id, q] of questions) console.log(`  ${id}: ${q.question}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
