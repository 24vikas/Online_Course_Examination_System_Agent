import test from "node:test";
import assert from "node:assert/strict";
import { MockDoclingClient } from "../src/docling-client.ts";
import { DocumentChunker } from "../src/chunker.ts";
import {
  SelfHostedBgeM3Provider,
  TestDeterministicEmbeddingProvider,
  ExternalEmbeddingForbiddenError,
} from "../src/embedding-provider.ts";
import { ScopedRetrievalService, ModelMismatchError } from "../src/retrieval-service.ts";
import { ReembeddingService, type ReembeddingDatabaseAdapter } from "../src/reembedding-service.ts";
import type { DocumentChunkItem } from "@exam-system/contracts";

const TENANT_ALPHA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_BETA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const COURSE_DBMS = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const COURSE_OOP = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SYLLABUS_V1 = "11111111-1111-1111-1111-111111111111";

test("Docling Conversion & Chunking: Preserves page numbers, headings, and tables", async () => {
  const docling = new MockDoclingClient();
  const chunker = new DocumentChunker({ maxChunkChars: 500 });

  const docId = "doc-dbms-001";
  const dummyPdf = Buffer.from("dummy-pdf-content");
  const conversion = await docling.convertDocument(docId, dummyPdf, "dbms_syllabus.pdf");

  assert.equal(conversion.totalPages, 3);
  assert.equal(conversion.elements.length, 5);

  const chunks = chunker.chunkDocument(TENANT_ALPHA, COURSE_DBMS, SYLLABUS_V1, conversion);

  assert.ok(chunks.length >= 3, "Should generate distinct chunks for units and tables");

  // Verify section header preservation
  const unit1Chunk = chunks.find((c) => c.sectionHeader.includes("Unit 1"));
  assert.ok(unit1Chunk, "Unit 1 heading must be preserved in chunk provenance");
  assert.equal(unit1Chunk?.pageStart, 1);

  // Verify table preservation
  const tableChunk = chunks.find((c) => c.elementType === "table");
  assert.ok(tableChunk, "Table structure must be preserved with element_type='table'");
  assert.ok(tableChunk?.content.includes("PRIMARY KEY"));
  assert.equal(tableChunk?.pageStart, 2);
});

test("Chunking Determinism: Identical inputs produce identical content hashes and chunk counts", async () => {
  const docling = new MockDoclingClient();
  const chunker = new DocumentChunker();

  const docId = "doc-determ-01";
  const dummyPdf = Buffer.from("dummy-pdf-content");
  const conversion = await docling.convertDocument(docId, dummyPdf, "syllabus.pdf");

  const run1 = chunker.chunkDocument(TENANT_ALPHA, COURSE_DBMS, SYLLABUS_V1, conversion);
  const run2 = chunker.chunkDocument(TENANT_ALPHA, COURSE_DBMS, SYLLABUS_V1, conversion);

  assert.equal(run1.length, run2.length);
  for (let i = 0; i < run1.length; i++) {
    assert.equal(run1[i]?.contentHash, run2[i]?.contentHash);
    assert.equal(run1[i]?.chunkIndex, run2[i]?.chunkIndex);
    assert.equal(run1[i]?.pageStart, run2[i]?.pageStart);
  }
});

test("BGE-M3 Provider: Validates exact 1024 dimensions, metadata, and L2 normalization", async () => {
  const provider = new SelfHostedBgeM3Provider();
  const meta = provider.getMetadata();

  assert.equal(meta.model, "BAAI/bge-m3");
  assert.equal(meta.version, "5617a9f61b028005a4858fdac845db406aefb181");
  assert.equal(meta.dimension, 1024);
  assert.equal(meta.provider, "self-hosted-bge-m3");

  const sampleTexts = [
    "Database schema normalization and B-tree index structures.",
    "Object-oriented inheritance, virtual dispatch, and encapsulation.",
  ];

  const result = await provider.embedTexts(sampleTexts);

  assert.equal(result.vectors.length, 2);
  assert.equal(result.vectors[0]?.length, 1024, "Output vector must be exactly 1024 dimensions");
  assert.equal(result.vectors[1]?.length, 1024, "Output vector must be exactly 1024 dimensions");

  // Verify L2 normalization: sqrt(sum(v_i^2)) ≈ 1.0
  const norm0 = Math.sqrt(result.vectors[0]!.reduce((sum, v) => sum + v * v, 0));
  const norm1 = Math.sqrt(result.vectors[1]!.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm0 - 1.0) < 0.001, `Vector 0 must be L2 normalized (got ${norm0})`);
  assert.ok(Math.abs(norm1 - 1.0) < 0.001, `Vector 1 must be L2 normalized (got ${norm1})`);
});

test("BGE-M3 Multilingual & Institutional Syntax: Handles Kannada, English, and SQL", async () => {
  const provider = new SelfHostedBgeM3Provider();

  const inputs = [
    "KLE Technological University — Computer Science Syllabus 2026",
    "ಕೆಎಲ್ಇ ತಾಂತ್ರಿಕ ವಿಶ್ವವಿದ್ಯಾಲಯ ಪಠ್ಯಕ್ರಮ - ದತ್ತಸಂಚಯ ನಿರ್ವಹಣಾ ವ್ಯವಸ್ಥೆ", // Kannada script
    "SELECT student_id, marks FROM exam_attempts WHERE status = 'SUBMITTED';",
  ];

  const result = await provider.embedTexts(inputs);
  assert.equal(result.vectors.length, 3);
  for (let i = 0; i < inputs.length; i++) {
    assert.equal(result.vectors[i]?.length, 1024);
    // Values must be valid numbers (no NaN or Infinity)
    for (const val of result.vectors[i]!) {
      assert.ok(!Number.isNaN(val) && Number.isFinite(val));
    }
  }

  // Determinism check: identical text yields identical 1024-d vector
  const resultAgain = await provider.embedTexts([inputs[1]!]);
  assert.equal(result.vectors[1]!.length, resultAgain.vectors[0]!.length);
  for (let k = 0; k < result.vectors[1]!.length; k++) {
    assert.ok(
      Math.abs(result.vectors[1]![k]! - resultAgain.vectors[0]![k]!) < 1e-4,
      `Dimension ${k} must match within numerical floating point tolerance`
    );
  }
});

test("Institutional Security: Rejects external cloud embedding APIs (Gemini/OpenAI)", async () => {
  const originalEnv = process.env.EMBEDDING_PROVIDER;
  try {
    process.env.EMBEDDING_PROVIDER = "gemini-text-embedding";
    assert.throws(
      () => new SelfHostedBgeM3Provider(),
      (err: any) => err instanceof ExternalEmbeddingForbiddenError
    );

    process.env.EMBEDDING_PROVIDER = "openai-embedding-3";
    assert.throws(
      () => new SelfHostedBgeM3Provider(),
      (err: any) => err instanceof ExternalEmbeddingForbiddenError
    );
  } finally {
    process.env.EMBEDDING_PROVIDER = originalEnv;
  }
});

test("Single-Model Index Invariant: Rejects vectors with dimension or model mismatch", async () => {
  const provider = new SelfHostedBgeM3Provider();
  const retrieval = new ScopedRetrievalService(provider);

  const chunk: DocumentChunkItem = {
    id: "chk-01",
    tenantId: TENANT_ALPHA,
    courseOfferingId: COURSE_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    documentId: "doc-01",
    chunkIndex: 0,
    content: "Sample content",
    contentHash: "hash-01",
    pageStart: 1,
    pageEnd: 1,
    sectionHeader: "Sec 1",
    elementType: "paragraph",
    embeddingStatus: "COMPLETED",
    embeddingModel: "legacy-384-model", // Mismatched model!
    createdAt: new Date().toISOString(),
  };

  // 1. Rejects wrong dimension vector (e.g. 384 instead of 1024)
  assert.throws(
    () => retrieval.indexChunk(chunk, new Array(384).fill(0.1)),
    (err: any) => err instanceof ModelMismatchError
  );

  // 2. Rejects wrong model with 1024-d vector
  assert.throws(
    () => retrieval.indexChunk(chunk, new Array(1024).fill(0.1)),
    (err: any) => err instanceof ModelMismatchError
  );
});

test("Controlled Re-Embedding: Safely updates legacy chunks to 1024-d BGE-M3", async () => {
  const provider = new SelfHostedBgeM3Provider();

  // Mock database tracking chunks
  class MockReembeddingDB implements ReembeddingDatabaseAdapter {
    public chunks: DocumentChunkItem[] = [
      {
        id: "chk-legacy-01",
        tenantId: TENANT_ALPHA,
        courseOfferingId: COURSE_DBMS,
        syllabusVersionId: SYLLABUS_V1,
        documentId: "doc-01",
        chunkIndex: 0,
        content: "Relational database transaction isolation levels ACID.",
        contentHash: "hash-legacy-01",
        pageStart: 1,
        pageEnd: 1,
        sectionHeader: "ACID Properties",
        elementType: "paragraph",
        embeddingModel: "legacy-384-model",
        embeddingVersion: "v0.1",
        embeddingDimension: 384,
        embeddingStatus: "PENDING",
        createdAt: new Date().toISOString(),
      },
    ];

    async findOutdatedChunks(tenantId: string, targetModel: string, targetVersion: string): Promise<DocumentChunkItem[]> {
      return this.chunks.filter(
        (c) =>
          c.tenantId === tenantId &&
          (c.embeddingModel !== targetModel || c.embeddingVersion !== targetVersion || c.embeddingStatus === "PENDING")
      );
    }

    async commitChunkEmbeddings(updates: Array<any>): Promise<void> {
      for (const update of updates) {
        const c = this.chunks.find((ch) => ch.id === update.chunkId);
        if (c) {
          c.embedding = update.vector;
          c.embeddingModel = update.model;
          c.embeddingVersion = update.version;
          c.embeddingDimension = update.dimension;
          c.embeddingStatus = "COMPLETED";
        }
      }
    }
  }

  const db = new MockReembeddingDB();
  const reembeddingService = new ReembeddingService(db, provider);

  const response = await reembeddingService.reembedOutdatedChunks({
    tenantId: TENANT_ALPHA,
    batchSize: 10,
  });

  assert.equal(response.status, "SUCCESS");
  assert.equal(response.chunksReembedded, 1);
  assert.equal(response.model, "BAAI/bge-m3");
  assert.equal(response.version, "5617a9f61b028005a4858fdac845db406aefb181");
  assert.equal(response.dimension, 1024);

  // Verify updated chunk in store
  const updated = db.chunks[0];
  assert.equal(updated?.embeddingModel, "BAAI/bge-m3");
  assert.equal(updated?.embeddingDimension, 1024);
  assert.equal(updated?.embedding?.length, 1024);
  assert.equal(updated?.embeddingStatus, "COMPLETED");
});

test("Scoped Retrieval: Dense 1024-d BGE-M3 multi-tenant and course isolation", async () => {
  const embedder = new SelfHostedBgeM3Provider();
  const retrieval = new ScopedRetrievalService(embedder);

  const chunkAlphaDBMS: DocumentChunkItem = {
    id: "chk-bge-alpha-01",
    tenantId: TENANT_ALPHA,
    courseOfferingId: COURSE_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    documentId: "doc-01",
    chunkIndex: 0,
    content: "The CREATE TABLE statement creates a relational table with schema attributes.",
    contentHash: "hash-01",
    pageStart: 1,
    pageEnd: 1,
    sectionHeader: "DDL Foundations",
    elementType: "paragraph",
    embeddingStatus: "COMPLETED",
    createdAt: new Date().toISOString(),
  };

  const chunkBetaDBMS: DocumentChunkItem = {
    id: "chk-bge-beta-01",
    tenantId: TENANT_BETA,
    courseOfferingId: COURSE_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    documentId: "doc-02",
    chunkIndex: 0,
    content: "The CREATE TABLE statement creates a relational table with schema attributes.",
    contentHash: "hash-02",
    pageStart: 1,
    pageEnd: 1,
    sectionHeader: "DDL Foundations",
    elementType: "paragraph",
    embeddingStatus: "COMPLETED",
    createdAt: new Date().toISOString(),
  };

  const { vectors } = await embedder.embedTexts([chunkAlphaDBMS.content, chunkBetaDBMS.content]);
  retrieval.indexChunk(chunkAlphaDBMS, vectors[0]!);
  retrieval.indexChunk(chunkBetaDBMS, vectors[1]!);

  // Query Tenant Alpha
  const resultAlpha = await retrieval.retrieveScopedChunks({
    tenantId: TENANT_ALPHA,
    courseOfferingId: COURSE_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    queryText: "CREATE TABLE syntax",
    targetTopicIds: [],
    targetCourseOutcomeIds: [],
    limit: 5,
  });

  assert.equal(resultAlpha.totalFound, 1);
  assert.equal(resultAlpha.chunks[0]?.id, "chk-bge-alpha-01");
  assert.equal(resultAlpha.chunks[0]?.tenantId, TENANT_ALPHA);
  assert.equal(resultAlpha.dimension, 1024);
  assert.equal(resultAlpha.model, "BAAI/bge-m3");

  // Query Tenant Beta
  const resultBeta = await retrieval.retrieveScopedChunks({
    tenantId: TENANT_BETA,
    courseOfferingId: COURSE_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    queryText: "CREATE TABLE syntax",
    targetTopicIds: [],
    targetCourseOutcomeIds: [],
    limit: 5,
  });

  assert.equal(resultBeta.totalFound, 1);
  assert.equal(resultBeta.chunks[0]?.id, "chk-bge-beta-01");
  assert.equal(resultBeta.chunks[0]?.tenantId, TENANT_BETA);

  // Negative Check: Unrelated course offering returns ZERO hits
  const resultUnrelatedCourse = await retrieval.retrieveScopedChunks({
    tenantId: TENANT_ALPHA,
    courseOfferingId: COURSE_OOP,
    syllabusVersionId: SYLLABUS_V1,
    queryText: "CREATE TABLE syntax",
    targetTopicIds: [],
    targetCourseOutcomeIds: [],
    limit: 5,
  });

  assert.equal(resultUnrelatedCourse.totalFound, 0);
  assert.equal(resultUnrelatedCourse.chunks.length, 0);
});
