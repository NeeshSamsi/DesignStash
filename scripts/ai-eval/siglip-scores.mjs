/**
 * Image meaning search for the eval: scores every cover against every gold query with SigLIP 2
 * B/16 (onnx-community/siglip2-base-patch16-224-ONNX, int8), as sigmoid(scale * cosine + bias).
 * Writes <eval dir>/siglip-scores.json: { "<lowercase query>": { "<item id>": probability } }.
 *
 * Not part of the repo's dependencies. Run it from a folder that has @huggingface/transformers:
 *   npm install @huggingface/transformers && node siglip-scores.mjs <repo>/scripts/ai-eval
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  SiglipModel,
  SiglipTextModel,
  SiglipVisionModel
} from '@huggingface/transformers'

const ID = 'onnx-community/siglip2-base-patch16-224-ONNX'
const TEXT_DTYPE = process.env.SIGLIP_TEXT_DTYPE ?? 'int8'
const VISION_DTYPE = process.env.SIGLIP_VISION_DTYPE ?? 'fp16'
const FULL_DTYPE = process.env.SIGLIP_FULL_DTYPE ?? VISION_DTYPE
const evalDir = join(homedir(), 'Library/Application Support/DesignStash-dev/ai-eval')
const goldDir = process.argv[2]
const items = JSON.parse(readFileSync(join(evalDir, 'items.json'), 'utf8')).filter((i) => !i.duplicateOf && i.coverPath)

const queries = new Set()
for (const f of ['gold.json', 'gold-heldout.json', 'gold-signoff.json']) {
  const g = JSON.parse(readFileSync(join(goldDir, f), 'utf8'))
  for (const q of g.queries ?? []) queries.add(q.q.toLowerCase())
  for (const q of Object.keys(g.addToQueries ?? {})) queries.add(q.toLowerCase())
}
const qs = [...queries]

const t = (label) => (console.error(label), Date.now())
let t0 = t('loading tokenizer, processor, towers')
const tokenizer = await AutoTokenizer.from_pretrained(ID)
const processor = await AutoProcessor.from_pretrained(ID)
const textModel = await SiglipTextModel.from_pretrained(ID, { dtype: TEXT_DTYPE })
const visionModel = await SiglipVisionModel.from_pretrained(ID, { dtype: VISION_DTYPE })
console.error('load ms', Date.now() - t0)

const norm = (v) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1
  return v.map((x) => x / n)
}
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0)

// Text tower
t0 = Date.now()
const textVecs = []
for (const q of qs) {
  const inputs = tokenizer([q], { padding: 'max_length', truncation: true, max_length: 64 })
  const out = await textModel(inputs)
  textVecs.push(norm(Array.from(out.pooler_output.data)))
}
const textMs = (Date.now() - t0) / qs.length

// Vision tower
t0 = Date.now()
const imageVecs = []
for (const item of items) {
  const image = await RawImage.read(item.coverPath)
  const inputs = await processor(image)
  const out = await visionModel(inputs)
  imageVecs.push(norm(Array.from(out.pooler_output.data)))
}
const imageMs = (Date.now() - t0) / items.length

// Calibration: the full model reports logits_per_image = scale * cosine + bias. Fit both on a sample.
const full = await SiglipModel.from_pretrained(ID, { dtype: FULL_DTYPE })
const xs = []
const ys = []
for (let k = 0; k < 24; k++) {
  const ii = (k * 7) % items.length
  const qi = (k * 13) % qs.length
  const inputs = {
    ...(await processor(await RawImage.read(items[ii].coverPath))),
    ...tokenizer([qs[qi]], { padding: 'max_length', truncation: true, max_length: 64 })
  }
  const out = await full(inputs)
  xs.push(dot(imageVecs[ii], textVecs[qi]))
  ys.push(out.logits_per_image.data[0])
}
const mx = xs.reduce((a, b) => a + b) / xs.length
const my = ys.reduce((a, b) => a + b) / ys.length
const scale = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0)
const bias = my - scale * mx
const resid = Math.max(...xs.map((x, i) => Math.abs(scale * x + bias - ys[i])))
console.error(`calibration: scale ${scale.toFixed(2)} bias ${bias.toFixed(2)} max residual ${resid.toFixed(3)}`)

const table = {}
qs.forEach((q, qi) => {
  table[q] = {}
  items.forEach((item, ii) => {
    table[q][item.id] = 1 / (1 + Math.exp(-(scale * dot(imageVecs[ii], textVecs[qi]) + bias)))
  })
})
writeFileSync(join(evalDir, 'siglip-scores.json'), JSON.stringify(table))
console.error(
  JSON.stringify({ textDtype: TEXT_DTYPE, visionDtype: VISION_DTYPE, queries: qs.length, covers: items.length, textMsPerQuery: +textMs.toFixed(1), imageMsPerCover: +imageMs.toFixed(1) })
)
