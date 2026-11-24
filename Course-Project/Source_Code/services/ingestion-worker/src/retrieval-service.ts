import type {
  DocumentChunkItem,
  ScopedRetrievalQuery,
  ScopedRetrievalResult,
} from "@exam-system/contracts";
import type { EmbeddingProvider } from "./embedding-provider.ts";

export class ModelMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelMismatchError";
  }
}

/**
 * Scoped Retrieval Service
 * Enforces strict multi-tenant isolation, course-offering boundaries,
 * and single-model index consistency (Instruction 6: Never mix models or dimensions).
 */
export class ScopedRetrievalService {
  private chunksStore: DocumentChunkItem[] = [];
  private vectorsStore: Map<string, number[]> = new Map();
  private embeddingProvider: EmbeddingProvider;

  constructor(embeddingProvider: EmbeddingProvider, initialChunks?: DocumentChunkItem[]) {
    this.embeddingProvider = embeddingProvider;
    if (initialChunks) {
      this.chunksStore = [...initialChunks];
    }
  }

  /**
   * Indexes a chunk with its embedding vector.
   * Guarantees that vector dimension and model metadata match the active provider.
   */
  indexChunk(chunk: DocumentChunkItem, vector: number[]): void {
    const meta = this.embeddingProvider.getMetadata();

    if (vector.length !== meta.dimension) {
      throw new ModelMismatchError(
        `VECTOR_DIMENSION_MISMATCH: Vector dimension ${vector.length} does not match active index dimension ${meta.dimension} (${meta.model})`
      );
    }

    if (chunk.embeddingModel && chunk.embeddingModel !== meta.model) {
      throw new ModelMismatchError(
        `MODEL_MISMATCH: Chunk model '${chunk.embeddingModel}' cannot be indexed into '${meta.model}' index.`
      );
    }

    // Persist metadata with chunk
    chunk.embeddingModel = meta.model;
    chunk.embeddingVersion = meta.version;
    chunk.embeddingDimension = meta.dimension;
    chunk.embeddingProvider = meta.provider;
    chunk.embeddingStatus = "COMPLETED";

    this.chunksStore.push(chunk);
    this.vectorsStore.set(chunk.id, vector);
  }

  /**
   * Scoped vector retrieval.
   * STRICT INVARIANTS:
   * 1. Evaluates tenant, offering, and syllabus version filters BEFORE ranking.
   * 2. Evaluates model and revision consistency: chunks from different models are excluded.
   * 3. Zero global fallback on empty scope.
   */
  async retrieveScopedChunks(
    query: ScopedRetrievalQuery
  ): Promise<ScopedRetrievalResult> {
    const activeMeta = this.embeddingProvider.getMetadata();

    // 1. Mandatory Pre-Filtering by Tenant, Offering, Syllabus Version, and Model
    const candidateChunks = this.chunksStore.filter(
      (c) =>
        c.tenantId === query.tenantId &&
        c.courseOfferingId === query.courseOfferingId &&
        c.syllabusVersionId === query.syllabusVersionId &&
        // Instruction 6: Exclude chunks from different models or un-reembedded versions
        (!c.embeddingModel || c.embeddingModel === activeMeta.model) &&
        (!c.embeddingDimension || c.embeddingDimension === activeMeta.dimension)
    );

    // If zero chunks exist in the requested scope, fail closed: return empty result
    if (candidateChunks.length === 0) {
      return {
        chunks: [],
        totalFound: 0,
        model: activeMeta.model,
        dimension: activeMeta.dimension,
        retrievalScope: {
          tenantId: query.tenantId,
          courseOfferingId: query.courseOfferingId,
          syllabusVersionId: query.syllabusVersionId,
        },
      };
    }

    // 2. Generate embedding for query using active model
    const { vectors } = await this.embeddingProvider.embedTexts([query.queryText]);
    const queryVector = vectors[0];
    if (!queryVector || queryVector.length !== activeMeta.dimension) {
      return {
        chunks: [],
        totalFound: 0,
        model: activeMeta.model,
        dimension: activeMeta.dimension,
        retrievalScope: {
          tenantId: query.tenantId,
          courseOfferingId: query.courseOfferingId,
          syllabusVersionId: query.syllabusVersionId,
        },
      };
    }

    // 3. Compute cosine similarity against candidate chunks only
    const scored = candidateChunks.map((chunk) => {
      const chunkVector = this.vectorsStore.get(chunk.id);
      let similarity = 0;
      if (chunkVector && chunkVector.length === queryVector.length) {
        similarity = this.cosineSimilarity(queryVector, chunkVector);
      }
      return { chunk, similarity };
    });

    // Sort descending by similarity
    scored.sort((a, b) => b.similarity - a.similarity);

    const topChunks = scored.slice(0, query.limit).map((s) => s.chunk);

    return {
      chunks: topChunks,
      totalFound: topChunks.length,
      model: activeMeta.model,
      dimension: activeMeta.dimension,
      retrievalScope: {
        tenantId: query.tenantId,
        courseOfferingId: query.courseOfferingId,
        syllabusVersionId: query.syllabusVersionId,
      },
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const valA = a[i] || 0;
      const valB = b[i] || 0;
      dot += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
