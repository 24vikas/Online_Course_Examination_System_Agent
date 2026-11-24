-- ==============================================================================
-- Migration 004: BAAI/bge-m3 1024-Dimensional pgvector Embeddings & Re-embedding
-- Approved Owner Decision: Option A (Self-Hosted Embedding Worker)
-- Model: BAAI/bge-m3 | Revision: 5617a9f61b028005a4858fdac845db406aefb181
-- License: MIT | Dimension: 1024 | Retrieval: Dense vector cosine similarity
-- ==============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add 1024-dimensional dense vector column to document_chunks and ensure revision string fits
ALTER TABLE document_chunks ALTER COLUMN embedding_version TYPE VARCHAR(64);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
    ) THEN
        ALTER TABLE document_chunks ADD COLUMN embedding vector(1024);
    END IF;
END $$;

-- 3. Invariant: Prevent mixing vector models or dimensions
-- Guarantees that vectors in document_chunks strictly adhere to the approved 1024-d BGE-M3 model
ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS chk_document_chunks_bge_m3_spec;
ALTER TABLE document_chunks ADD CONSTRAINT chk_document_chunks_bge_m3_spec
    CHECK (
        (embedding IS NULL) OR (
            embedding_dimension = 1024 
            AND embedding_model = 'BAAI/bge-m3'
        )
    );

-- 4. Single-model index: Enforces that retrieval indexes NEVER mix models or revisions
-- Uses HNSW index for high-recall dense vector cosine similarity
CREATE INDEX IF NOT EXISTS idx_document_chunks_bge_m3_1024_hnsw
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL
      AND embedding_dimension = 1024
      AND embedding_model = 'BAAI/bge-m3'
      AND embedding_version = '5617a9f61b028005a4858fdac845db406aefb181';

-- Composite index for scoped retrieval pre-filtering with active BGE-M3 embeddings
CREATE INDEX IF NOT EXISTS idx_document_chunks_scoped_bge_m3
    ON document_chunks(tenant_id, course_offering_id, syllabus_version_id, embedding_status)
    WHERE embedding_model = 'BAAI/bge-m3';

-- 5. Controlled Re-Embedding Procedure
-- Marks outdated chunks for re-embedding without destroying existing embeddings until new vectors are ready
CREATE OR REPLACE FUNCTION mark_chunks_for_reembedding(
    p_tenant_id UUID,
    p_target_model VARCHAR DEFAULT 'BAAI/bge-m3',
    p_target_version VARCHAR DEFAULT '5617a9f61b028005a4858fdac845db406aefb181'
)
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE document_chunks
    SET embedding_status = 'PENDING'
    WHERE tenant_id = p_tenant_id
      AND (
          embedding_model IS DISTINCT FROM p_target_model
          OR embedding_version IS DISTINCT FROM p_target_version
          OR embedding IS NULL
          OR embedding_status = 'FAILED'
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Safe Commit Stored Procedure for Worker
CREATE OR REPLACE FUNCTION commit_chunk_embedding(
    p_chunk_id UUID,
    p_tenant_id UUID,
    p_embedding vector(1024),
    p_model VARCHAR,
    p_version VARCHAR
)
RETURNS VOID AS $$
BEGIN
    -- Strict validation against unapproved models
    IF p_model != 'BAAI/bge-m3' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MODEL: Only approved BAAI/bge-m3 embeddings may be committed.';
    END IF;

    UPDATE document_chunks
    SET
        embedding = p_embedding,
        embedding_dimension = 1024,
        embedding_model = p_model,
        embedding_version = p_version,
        embedding_provider = 'self-hosted-bge-m3',
        embedding_status = 'COMPLETED'
    WHERE id = p_chunk_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;
