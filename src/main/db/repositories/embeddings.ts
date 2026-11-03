import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../connection'
import { mockupEmbeddings } from '../schema'

/** A vector as the BLOB column keeps it: little-endian Float32. */
function toBlob(vector: ArrayLike<number>): Buffer {
  return Buffer.from(Float32Array.from(vector).buffer)
}

function fromBlob(blob: Buffer): Float32Array {
  // Copied, because a Buffer from the driver may not sit on a 4-byte boundary.
  return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))
}

/** The meaning-search vectors: one per mockup per model, with the hash of the text they were made from. */
export class EmbeddingRepository {
  constructor(private readonly db: AppDatabase) {}

  upsert(mockupId: number, modelId: string, vector: ArrayLike<number>, textHash: string): void {
    const row = { mockupId, modelId, dimension: vector.length, vector: toBlob(vector), textHash }
    this.db
      .insert(mockupEmbeddings)
      .values(row)
      .onConflictDoUpdate({
        target: [mockupEmbeddings.mockupId, mockupEmbeddings.modelId],
        set: { dimension: row.dimension, vector: row.vector, textHash }
      })
      .run()
  }

  /** The hash of the text a mockup's vector was made from, or null when it has none. */
  hashOf(mockupId: number, modelId: string): string | null {
    return (
      this.db
        .select({ textHash: mockupEmbeddings.textHash })
        .from(mockupEmbeddings)
        .where(and(eq(mockupEmbeddings.mockupId, mockupId), eq(mockupEmbeddings.modelId, modelId)))
        .get()?.textHash ?? null
    )
  }

  /** Every vector of a model, by mockup id. */
  vectors(modelId: string): Map<number, Float32Array> {
    const rows = this.db
      .select({ id: mockupEmbeddings.mockupId, vector: mockupEmbeddings.vector })
      .from(mockupEmbeddings)
      .where(eq(mockupEmbeddings.modelId, modelId))
      .all()
    return new Map(rows.map((r) => [r.id, fromBlob(r.vector)]))
  }

  count(modelId: string): number {
    return (
      this.db
        .select({ c: sql<number>`count(*)` })
        .from(mockupEmbeddings)
        .where(eq(mockupEmbeddings.modelId, modelId))
        .get()?.c ?? 0
    )
  }

  /** Forget every vector of a model (the model was deleted). */
  removeModel(modelId: string): void {
    this.db.delete(mockupEmbeddings).where(eq(mockupEmbeddings.modelId, modelId)).run()
  }
}
