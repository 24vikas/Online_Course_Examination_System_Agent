import type {
  ReembeddingRequest,
  ReembeddingResponse,
  DocumentChunkItem,
} from "@exam-system/contracts";
import type { EmbeddingProvider } from "./embedding-provider.ts";

export interface ReembeddingDatabaseAdapter {
  findOutdatedChunks(
    tenantId: string,
    targetModel: string,
    targetVersion: string,
    limit: number
  ): Promise<DocumentChunkItem[]>;
  commitChunkEmbeddings(
    updates: Array<{
      chunkId: string;
      tenantId: string;
      vector: number[];
      model: string;
      version: string;
      dimension: number;
    }>
  ): Promise<void>;
}

/**
 * Controlled Re-Embedding Service (Instruction 7)
 * Safely updates document chunk embeddings when model or revision changes.
 * Preserves old embeddings during computation; writes atomic batch updates.
 */
export class ReembeddingService {
  private readonly db: ReembeddingDatabaseAdapter;
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(db: ReembeddingDatabaseAdapter, embeddingProvider: EmbeddingProvider) {
    this.db = db;
    this.embeddingProvider = embeddingProvider;
  }

  async reembedOutdatedChunks(request: ReembeddingRequest): Promise<ReembeddingResponse> {
    const meta = this.embeddingProvider.getMetadata();
    const targetModel = request.targetModel || meta.model;
    const targetVersion = request.targetVersion || meta.version;
    const targetDimension = request.targetDimension || meta.dimension;
    const batchSize = request.batchSize || 50;

    let totalReembedded = 0;
    const errors: string[] = [];

    try {
      const outdatedChunks = await this.db.findOutdatedChunks(
        request.tenantId,
        targetModel,
        targetVersion,
        batchSize
      );

      if (outdatedChunks.length === 0) {
        return {
          tenantId: request.tenantId,
          chunksReembedded: 0,
          model: targetModel,
          version: targetVersion,
          dimension: targetDimension,
          status: "SUCCESS",
          errors: [],
        };
      }

      // Batch generate embeddings using approved provider
      const texts = outdatedChunks.map((c) => c.content);
      const { vectors } = await this.embeddingProvider.embedTexts(texts);

      if (vectors.length !== outdatedChunks.length) {
        throw new Error(
          `REEMBEDDING_COUNT_MISMATCH: Sent ${outdatedChunks.length} chunks, received ${vectors.length} vectors.`
        );
      }

      const updates = outdatedChunks.map((chunk, idx) => ({
        chunkId: chunk.id,
        tenantId: request.tenantId,
        vector: vectors[idx] || [],
        model: targetModel,
        version: targetVersion,
        dimension: targetDimension,
      }));

      await this.db.commitChunkEmbeddings(updates);
      totalReembedded += updates.length;

      return {
        tenantId: request.tenantId,
        chunksReembedded: totalReembedded,
        model: targetModel,
        version: targetVersion,
        dimension: targetDimension,
        status: "SUCCESS",
        errors: [],
      };
    } catch (err: any) {
      errors.push(err.message || String(err));
      return {
        tenantId: request.tenantId,
        chunksReembedded: totalReembedded,
        model: targetModel,
        version: targetVersion,
        dimension: targetDimension,
        status: totalReembedded > 0 ? "PARTIAL" : "FAILED",
        errors,
      };
    }
  }
}
