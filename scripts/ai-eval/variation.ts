/**
 * Round 4, variation words (design/research/ai-round4.md): for each mockup in a pile, the top
 * included, 1 to 3 words for what sets it apart, which follow the pile's base title ("Long scroll
 * MacBook · side view"). Scored on the eval's B piles against `round4/variations.json`. Two ways of
 * asking, each on one composite image so every model sees the same thing (Apple's helper takes one
 * image):
 *   pair  the top beside the mockup: what does this one show differently? For the top, the top
 *         beside its first variant: what sets the top apart?
 *   pile  every mockup in the pile, numbered, in one request: a variation for each.
 *
 *   pnpm exec tsx --tsconfig tsconfig.node.json scripts/ai-eval/variation.ts --model qwen3.5-9b --how pair|pile
 *
 * Writes runs/<model>/variation-<how>/results.json and one log line per mockup in run.ts's format.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlamaServer, defaultLlamaServerDeps } from '../../src/main/ai/llama-server'
import { MODEL_SERVER_ARGS, resolveLlamaServerPath } from '../../src/main/ai/provider-factory'
import { MODEL_FILE_NAMES } from '../../src/main/ai/registry'
import { NativeHelper, resolveHelperPath } from '../../src/main/native/helper'
import { COVERS_DIR, DEV_DIR, argValue, readItems, runDir, writeJson } from './eval-files'
import { piles } from './prompts/pile'
import { fileMarkers, judge, type GoldVariation, type Verdict } from './variation-score'

const SYSTEM =
  "You help keep a designer's mockup library tidy. A pile holds variants of one mockup: other angles, scenes or states of the same product. Each mockup in a pile gets a short variation after the pile's title, such as \"side view\", \"on gravel\" or \"folded\" for a bike, so the person can tell them apart. Write in English."

const RULES =
  'Look at the angle or view, the setting or surface, the state (open, closed, lit) and how many objects it shows. Never name a colour of the object itself, and never describe what is printed or shown on it.'

function pairText(left: string, right: string, aboutLeft: boolean): string {
  const which = aboutLeft ? '1 shows differently from 2' : '2 shows differently from 1'
  return [
    `The image shows two mockups from one pile side by side: 1 on the left (file ${left}) and 2 on the right (file ${right}).`,
    `In 1 to 3 words, say what ${which}. ${RULES} If the two look the same, answer "same".`,
    'Reply with JSON: difference.'
  ].join('\n')
}

function pileText(names: string[]): string {
  return [
    `The image shows ${names.length} mockups from one pile, numbered 1 to ${names.length} from left to right and top to bottom. Files: ${names.map((n, i) => `${i + 1} = ${n}`).join(', ')}.`,
    `For each one, in 1 to 3 words, say what sets it apart from the others. ${RULES} Give each a different answer where you can, and answer "same" for one that looks the same as another.`,
    `Reply with JSON: variations, a list of ${names.length} answers in order.`
  ].join('\n')
}

const PAIR_SCHEMA = { type: 'object', properties: { difference: { type: 'string' } }, required: ['difference'] }
const pileSchema = (n: number) => ({
  type: 'object',
  properties: { variations: { type: 'array', items: { type: 'string' }, minItems: n, maxItems: n } },
  required: ['variations']
})

/** The covers side by side, numbered, at most 1024 px wide: three to a row. */
async function composite(ids: string[]): Promise<Buffer> {
  const cols = Math.min(3, ids.length)
  const w = Math.floor(1024 / cols)
  const label = 44
  const tiles = await Promise.all(
    ids.map(async (id, i) => {
      const img = await sharp(join(COVERS_DIR, id, 'cover.webp')).resize(w, w, { fit: 'contain', background: '#ffffff' }).toBuffer()
      const tag = Buffer.from(`<svg width="${w}" height="${label}"><rect width="${w}" height="${label}" fill="#ffffff"/><text x="12" y="34" font-size="32" font-weight="bold" font-family="Helvetica" fill="#000000">${i + 1}</text></svg>`)
      return { img, tag }
    })
  )
  const rows = Math.ceil(ids.length / cols)
  return sharp({ create: { width: cols * w, height: rows * (w + label), channels: 3, background: '#ffffff' } })
    .composite(
      tiles.flatMap((t, i) => {
        const left = (i % cols) * w
        const top = Math.floor(i / cols) * (w + label)
        return [
          { input: t.tag, left, top },
          { input: t.img, left, top: top + label }
        ]
      })
    )
    .jpeg({ quality: 88 })
    .toBuffer()
}

async function main(): Promise<void> {
  const model = argValue('model')
  const how = argValue('how') ?? 'pair'
  if (!model || !['pair', 'pile'].includes(how)) throw new Error('Usage: variation.ts --model <id> --how pair|pile')
  const gold = (JSON.parse(readFileSync(join(import.meta.dirname, 'round4', 'variations.json'), 'utf8')) as { items: Record<string, GoldVariation> }).items
  const names = new Map(readItems().map((i) => [i.id, i.fileName]))
  const ps = piles()
  const total = ps.reduce((t, p) => t + 1 + p.variants.length, 0)
  console.log(`${model} · variation-${how} · ${total} items × 1\n`)

  const scratch = join(tmpdir(), 'designstash-variation')
  mkdirSync(scratch, { recursive: true })
  let ask: (image: Buffer, text: string, schema: object, maxTokens: number) => Promise<string>
  let stop: () => Promise<void>
  if (model === 'apple') {
    const helper = new NativeHelper({ binaryPath: resolveHelperPath(), idleMs: 5_000 })
    ask = async (image, text, schema, maxTokens) => {
      const path = join(scratch, `ask-${Date.now()}.jpg`)
      writeFileSync(path, image)
      return (await helper.describe({ imagePath: path, instructions: SYSTEM, prompt: text, schema, maxTokens })).text
    }
    stop = () => helper.stop()
  } else {
    const modelDir = join(DEV_DIR, 'models', model)
    const binaryPath = resolveLlamaServerPath(process.env, undefined)
    if (!binaryPath || !existsSync(join(modelDir, MODEL_FILE_NAMES.model))) throw new Error(`No llama-server or model files for ${model}`)
    const server = new LlamaServer(
      { binaryPath, modelPath: join(modelDir, MODEL_FILE_NAMES.model), mmprojPath: join(modelDir, MODEL_FILE_NAMES.mmproj), extraArgs: MODEL_SERVER_ARGS[model] ?? [] },
      defaultLlamaServerDeps
    )
    ask = async (image, text, schema, maxTokens) => {
      const url = `data:image/jpeg;base64,${image.toString('base64')}`
      const json = await server.complete({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [{ type: 'image_url', image_url: { url } }, { type: 'text', text }] }
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'variation', schema } },
        temperature: 0,
        max_tokens: maxTokens,
        seed: 42
      })
      return String(json.choices?.[0]?.message?.content ?? '')
    }
    stop = () => server.stop()
  }

  const results: { id: string; pile: string; top: boolean; said: string | null; verdict: Verdict | null; fallback: string; ms: number; error?: string }[] = []
  const record = (id: string, pile: string, said: string | null, ms: number, siblings: string[], index: number, error?: string) => {
    const g = gold[id]
    if (!g) throw new Error(`No variation gold for ${id}`)
    const verdict = said === null ? null : judge(said, g)
    results.push({ id, pile, top: id === pile, said, verdict, fallback: fileMarkers(siblings)[index]!, ms: Math.round(ms), ...(error && { error }) })
    console.log(`${String(Math.round(ms)).padStart(6)}ms  ${id}  ${said ?? `FAILED ${error}`} [${verdict ?? '-'}; I'd say ${g.say}]`)
  }
  try {
    for (const p of ps) {
      const ids = [p.top, ...p.variants]
      const siblings = ids.map((id) => names.get(id) ?? id)
      if (how === 'pile') {
        const started = performance.now()
        try {
          const reply = JSON.parse(await ask(await composite(ids), pileText(siblings), pileSchema(ids.length), 60 + 30 * ids.length)) as { variations?: unknown }
          const said = Array.isArray(reply.variations) ? reply.variations.map(String) : []
          const each = (performance.now() - started) / ids.length
          ids.forEach((id, i) => record(id, p.top, said[i] ?? null, each, siblings, i, said[i] === undefined ? 'no answer for it' : undefined))
        } catch (err) {
          const each = (performance.now() - started) / ids.length
          ids.forEach((id, i) => record(id, p.top, null, each, siblings, i, (err as Error).message))
        }
        continue
      }
      for (const [i, id] of ids.entries()) {
        const isTop = i === 0
        const pair = isTop ? [p.top, p.variants[0]!] : [p.top, id]
        const started = performance.now()
        try {
          const reply = JSON.parse(await ask(await composite(pair), pairText(names.get(pair[0]!) ?? pair[0]!, names.get(pair[1]!) ?? pair[1]!, isTop), PAIR_SCHEMA, 60)) as { difference?: unknown }
          record(id, p.top, typeof reply.difference === 'string' ? reply.difference.trim() : null, performance.now() - started, siblings, i)
        } catch (err) {
          record(id, p.top, null, performance.now() - started, siblings, i, (err as Error).message)
        }
      }
    }
  } finally {
    await stop()
  }

  const out = join(runDir(model, `variation-${how}`), 'results.json')
  writeJson(out, results)
  const n = results.length
  const count = (v: Verdict, top?: boolean) => results.filter((r) => r.verdict === v && (top === undefined || r.top === top)).length
  const tops = results.filter((r) => r.top).length
  console.log(`\n${n} answers, ${results.filter((r) => r.verdict === null).length} failed, avg ${Math.round(results.reduce((t, r) => t + r.ms, 0) / n)}ms. Wrote ${out}`)
  console.log(`right ${count('right')} of ${n} (tops ${count('right', true)} of ${tops}, variants ${count('right', false)} of ${n - tops}); same calls ${count('same')}; other ${count('other')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
