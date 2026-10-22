import type { LlamaServer } from '../ai/llama-server'
import { DOCUMENT_PREFIX, MAX_DOCUMENT_CHARS, QUERY_PREFIX, normalise } from './meaning'

/** Turns text into unit vectors for meaning search. */
export interface MeaningEmbedder {
  embedDocuments(texts: readonly string[]): Promise<Float32Array[]>
  embedQuery(query: string): Promise<Float32Array>
  /** Stop whatever runs the model. */
  stop(): Promise<void>
}

/** Nomic through an embedding-mode `LlamaServer`, with the prefixes it was evaluated with. */
export class LlamaMeaningEmbedder implements MeaningEmbedder {
  constructor(private readonly server: Pick<LlamaServer, 'embed' | 'stop'>) {}

  async embedDocuments(texts: readonly string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return []
    const vectors = await this.server.embed(texts.map((t) => DOCUMENT_PREFIX + t.slice(0, MAX_DOCUMENT_CHARS)))
    return vectors.map((v) => Float32Array.from(normalise(v)))
  }

  async embedQuery(query: string): Promise<Float32Array> {
    const [vector] = await this.server.embed([QUERY_PREFIX + query.slice(0, 200)])
    if (!vector) throw new Error('No embedding for the query')
    return Float32Array.from(normalise(vector))
  }

  stop(): Promise<void> {
    return this.server.stop()
  }
}
