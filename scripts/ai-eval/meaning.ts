/**
 * Meaning search for the eval: text embeddings through llama-server, image scores from SigLIP 2
 * (computed by a script outside the repo), and the ways to blend them with the keyword search.
 * Eval-only; nothing here is in the app.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEV_DIR, EVAL_DIR } from './eval-files'
import {
  DOCUMENT_PREFIX,
  QUERY_PREFIX,
  appendMeaningHits,
  compactCosine,
  compactVector,
  meaningHits,
  shortVector
} from '../../src/main/search/meaning'

export interface EmbedModel {
  id: string
  /** The GGUF under models/embed-<id>/. */
  file: string
  /** Put in front of every indexed document and every query. */
  documentPrefix: string
  queryPrefix: string
  /** Set for macOS's built-in NaturalLanguage models, run by `apple/embed.swift` instead of llama-server. */
  apple?: 'sentence' | 'contextual'
}

export const EMBED_MODELS: Record<string, EmbedModel> = {
  nlsentence: {
    id: 'nl-sentence',
    file: '',
    documentPrefix: '',
    queryPrefix: '',
    apple: 'sentence'
  },
  nlcontextual: {
    id: 'nl-contextual',
    file: '',
    documentPrefix: '',
    queryPrefix: '',
    apple: 'contextual'
  },
  bge: {
    id: 'bge-small-en-v1.5',
    file: 'bge-small-en-v1.5-q8_0.gguf',
    documentPrefix: '',
    queryPrefix: 'Represent this sentence for searching relevant passages: '
  },
  nomic: {
    id: 'nomic-embed-text-v1.5',
    file: 'nomic-embed-text-v1.5.Q8_0.gguf',
    documentPrefix: DOCUMENT_PREFIX,
    queryPrefix: QUERY_PREFIX
  },
  qwen3: {
    id: 'Qwen3-Embedding-0.6B',
    file: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
    documentPrefix: '',
    queryPrefix:
      'Instruct: Given a search for a design mockup, retrieve mockups whose description matches it\nQuery:'
  }
}

const LLAMA_SERVER = join(DEV_DIR, 'llama-server', 'current', 'llama-server')
const CACHE_DIR = join(EVAL_DIR, 'embed-cache')

type Vec = number[]

function normalise(v: Vec): Vec {
  const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1
  return v.map((x) => x / n)
}

const dot = (a: Vec, b: Vec) => a.reduce((t, x, i) => t + x * b[i]!, 0)

/** Text embeddings by llama-server, cached on disk by the exact text (prefix included). */
export class TextEmbedder {
  private proc: ChildProcess | null = null
  private port = 0
  private readonly cachePath: string
  private readonly cache: Record<string, Vec>
  /** Milliseconds spent embedding, texts embedded, for the cost report. */
  stats = { ms: 0, texts: 0 }

  constructor(readonly model: EmbedModel) {
    mkdirSync(CACHE_DIR, { recursive: true })
    this.cachePath = join(CACHE_DIR, `${model.id}.json`)
    this.cache = existsSync(this.cachePath)
      ? (JSON.parse(readFileSync(this.cachePath, 'utf8')) as Record<string, Vec>)
      : {}
  }

  private key(text: string): string {
    return createHash('sha1').update(text).digest('hex')
  }

  /** Embeds texts with the compiled `apple/embed.swift`, built on first use. */
  private embedApple(texts: string[]): Vec[] {
    const bin = join(EVAL_DIR, 'bin', 'ds-embed')
    if (!existsSync(bin)) {
      mkdirSync(join(EVAL_DIR, 'bin'), { recursive: true })
      execFileSync('swiftc', ['-O', join(import.meta.dirname, 'apple', 'embed.swift'), '-o', bin])
    }
    const dir = mkdtempSync(join(tmpdir(), 'ds-embed-'))
    try {
      writeFileSync(join(dir, 'in.json'), JSON.stringify(texts))
      execFileSync(bin, [this.model.apple!, join(dir, 'in.json'), join(dir, 'out.json')], {
        stdio: ['ignore', 'ignore', 'inherit']
      })
      const raw = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as (Vec | null)[]
      return raw.map((v) => normalise(v ?? new Array(512).fill(0)))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  private async start(): Promise<void> {
    if (this.proc) return
    const gguf = join(DEV_DIR, 'models', `embed-${this.model.id}`, this.model.file)
    if (!existsSync(gguf)) throw new Error(`No embedding model at ${gguf}`)
    this.port = 18700 + Math.floor(Math.random() * 200)
    this.proc = spawn(
      LLAMA_SERVER,
      [
        '-m',
        gguf,
        '--embedding',
        '--host',
        '127.0.0.1',
        '--port',
        String(this.port),
        '-c',
        '4096',
        '-ngl',
        '99'
      ],
      { stdio: 'ignore' }
    )
    for (let i = 0; i < 120; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/health`)
        if (res.ok) return
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('llama-server did not start')
  }

  /** Normalised vectors for texts, in order. Uncached texts go out in one request. */
  async embed(texts: string[]): Promise<Vec[]> {
    const missing = [...new Set(texts.filter((t) => !(this.key(t) in this.cache)))]
    if (missing.length > 0) {
      const t0 = Date.now()
      if (this.model.apple) {
        this.embedApple(missing).forEach((v, i) => (this.cache[this.key(missing[i]!)] = v))
      } else await this.start()
      for (let i = 0; !this.model.apple && i < missing.length; i += 16) {
        const batch = missing.slice(i, i + 16)
        const res = await fetch(`http://127.0.0.1:${this.port}/v1/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: batch })
        })
        if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`)
        const body = (await res.json()) as { data: { index: number; embedding: Vec }[] }
        for (const row of body.data)
          this.cache[this.key(batch[row.index]!)] = normalise(row.embedding)
      }
      this.stats.ms += Date.now() - t0
      this.stats.texts += missing.length
      writeFileSync(this.cachePath, JSON.stringify(this.cache))
    }
    return texts.map((t) => this.cache[this.key(t)]!)
  }

  close(): void {
    this.proc?.kill()
    this.proc = null
  }
}

/** A similarity for every item, per query (higher is closer). */
export type Similarities = (query: string) => Map<string, number>

/** Cosine between each query and each document text, built for one pass of one run. */
/**
 * Each query's similarity to each document. `compact` scores as the app keeps vectors since F-070:
 * the documents cut to 256 numbers and kept as bytes, the queries cut to 256 (`src/main/search/meaning.ts`).
 */
export async function textSimilarities(
  embedder: TextEmbedder,
  docs: { id: string; text: string }[],
  queries: string[],
  { compact = false }: { compact?: boolean } = {}
): Promise<Similarities> {
  const { documentPrefix, queryPrefix } = embedder.model
  const docVecs = await embedder.embed(docs.map((d) => documentPrefix + d.text))
  const queryVecs = await embedder.embed(queries.map((q) => queryPrefix + q))
  const score: (q: number, d: number) => number = compact
    ? (() => {
        const compactDocs = docVecs.map((v) => compactVector(v))
        const shortQueries = queryVecs.map((v) => shortVector(v))
        return (q: number, d: number) => compactCosine(shortQueries[q]!, compactDocs[d]!)
      })()
    : (q, d) => dot(queryVecs[q]!, docVecs[d]!)
  const byQuery = new Map(queries.map((q, i) => [q, new Map(docs.map((d, j) => [d.id, score(i, j)]))]))
  return (q) => byQuery.get(q) ?? new Map()
}

export const SIGLIP_SCORES_PATH = join(EVAL_DIR, 'siglip-scores.json')

/** SigLIP probabilities per lowercase query and item id, written by the outside script. */
export function imageSimilarities(): Similarities {
  const table = JSON.parse(readFileSync(SIGLIP_SCORES_PATH, 'utf8')) as Record<
    string,
    Record<string, number>
  >
  return (q) => new Map(Object.entries(table[q.toLowerCase()] ?? {}))
}

export type Fusion = 'cutoff' | 'rrf'

export interface Lever {
  sims: Similarities
  /** Items at or above this similarity count as meaning hits. */
  cut: number
  /** Rank rule: keep only the closest `top` hits above the cut. */
  top?: number
}

const RRF_K = 60

/** Meaning hits for one query, closest first. The rank rule is the app's own (`src/main/search/meaning.ts`). */
function hits(lever: Lever, query: string): string[] {
  return meaningHits(lever.sims(query), { floor: lever.cut, top: lever.top ?? Infinity })
}

/**
 * Blends the keyword results with the meaning hits.
 * `cutoff`: every keyword hit first, in order, then the meaning hits keyword search missed, ordered
 * by the reciprocal rank fusion of the meaning lists.
 * `rrf`: reciprocal rank fusion over the keyword list and the meaning lists together.
 */
export function fuse(
  fusion: Fusion,
  query: string,
  keywordIds: string[],
  levers: Lever[]
): string[] {
  if (levers.length === 0) return keywordIds
  const lists = levers.map((l) => hits(l, query))
  // One meaning lever, keyword first: exactly what the app does.
  if (fusion === 'cutoff' && lists.length === 1) return appendMeaningHits(keywordIds, lists[0]!)
  const score = (ids: string[][]): Map<string, number> => {
    const out = new Map<string, number>()
    for (const list of ids)
      list.forEach((id, rank) => out.set(id, (out.get(id) ?? 0) + 1 / (RRF_K + rank + 1)))
    return out
  }
  if (fusion === 'cutoff') {
    const seen = new Set(keywordIds)
    const extra = [...score(lists)].filter(([id]) => !seen.has(id)).sort((a, b) => b[1] - a[1])
    return [...keywordIds, ...extra.map(([id]) => id)]
  }
  return [...score([keywordIds, ...lists])].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}
