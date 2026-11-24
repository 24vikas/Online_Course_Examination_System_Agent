import { z } from "zod";
import { UUIDSchema } from "./academic.ts";

// Approved Embedding Constants (Owner Decision 2026-11-12)
export const APPROVED_EMBEDDING_MODEL = "BAAI/bge-m3" as const;
export const APPROVED_EMBEDDING_REVISION = "5617a9f61b028005a4858fdac845db406aefb181" as const;
export const APPROVED_EMBEDDING_DIMENSION = 1024 as const;
export const APPROVED_EMBEDDING_PROVIDER = "self-hosted-bge-m3" as const;

// Document Lifecycle Status
export const DocumentStatusSchema = z.enum([
  "UPLOADED",
  "QUEUED",
  "PROCESSING",
  "READY",
  "FAILED",
]);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

// Ingestion Job Status
export const IngestionJobStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "RETRY_WAIT",
]);
export type IngestionJobStatus = z.infer<typeof IngestionJobStatusSchema>;

// Supported Knowledge Ingestion MIME Types
export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.ms-powerpoint", // ppt
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "text/csv",
  "application/csv",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/html",
  "application/json",
] as const;

export const DocumentMimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/html",
  "application/json",
]);
export type DocumentMimeType = z.infer<typeof DocumentMimeTypeSchema>;

// Document Registration Intent (Pre-Upload / Intent Creation)
export const DocumentRegistrationRequestSchema = z.object({
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  filename: z.string().min(1).max(255),
  mimeType: DocumentMimeTypeSchema,
  fileSizeBytes: z.number().int().min(1).max(104857600), // Max 100MB
  sha256Hash: z.string().length(64),
});
export type DocumentRegistrationRequest = z.infer<typeof DocumentRegistrationRequestSchema>;

// Persisted Document Metadata Record
export const DocumentMetadataSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  filename: z.string(),
  storageKey: z.string(), // Private storage key: tenant-documents/{tenant_id}/{offering_id}/{doc_id}/{hash}.ext
  mimeType: z.string(),
  fileSizeBytes: z.number().int(),
  sha256Hash: z.string().length(64),
  status: DocumentStatusSchema,
  uploadedBy: UUIDSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

// Ingestion Job Tracking Record
export const DocumentIngestionJobSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  documentId: UUIDSchema,
  jobStatus: IngestionJobStatusSchema,
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().default(3),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type DocumentIngestionJob = z.infer<typeof DocumentIngestionJobSchema>;

// Embedding Metadata Schema
export const EmbeddingMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  version: z.string(),
  dimension: z.number().int(),
});
export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>;

// Document Chunk with Strict Provenance and 1024-d Embedding
export const DocumentChunkItemSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  documentId: UUIDSchema,
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  contentHash: z.string().length(64),
  pageStart: z.number().int().min(1),
  pageEnd: z.number().int().min(1),
  sectionHeader: z.string().default(""),
  elementType: z.string().default("paragraph"),
  embedding: z.array(z.number()).optional(), // 1024-d dense vector when populated
  embeddingStatus: z.enum(["PENDING", "COMPLETED", "FAILED"]).default("PENDING"),
  embeddingProvider: z.string().optional(),
  embeddingModel: z.string().optional(),
  embeddingVersion: z.string().optional(),
  embeddingDimension: z.number().int().optional(),
  createdAt: z.string().datetime(),
});
export type DocumentChunkItem = z.infer<typeof DocumentChunkItemSchema>;

// Scoped Vector Retrieval Query
export const ScopedRetrievalQuerySchema = z.object({
  tenantId: UUIDSchema,
  courseOfferingId: UUIDSchema,
  syllabusVersionId: UUIDSchema,
  queryText: z.string().min(1),
  targetTopicIds: z.array(UUIDSchema).default([]),
  targetCourseOutcomeIds: z.array(UUIDSchema).default([]),
  limit: z.number().int().min(1).max(20).default(5),
  requiredModel: z.string().optional(),
  requiredDimension: z.number().int().optional(),
});
export type ScopedRetrievalQuery = z.infer<typeof ScopedRetrievalQuerySchema>;

export const ScopedRetrievalResultSchema = z.object({
  chunks: z.array(DocumentChunkItemSchema),
  totalFound: z.number().int(),
  model: z.string(),
  dimension: z.number().int(),
  retrievalScope: z.object({
    tenantId: UUIDSchema,
    courseOfferingId: UUIDSchema,
    syllabusVersionId: UUIDSchema,
  }),
});
export type ScopedRetrievalResult = z.infer<typeof ScopedRetrievalResultSchema>;

// Controlled Re-Embedding Request & Response (Instruction 7)
export const ReembeddingRequestSchema = z.object({
  tenantId: UUIDSchema,
  targetModel: z.string().optional(),
  targetVersion: z.string().optional(),
  targetDimension: z.number().int().optional(),
  batchSize: z.number().int().min(1).max(500).optional(),
});
export type ReembeddingRequest = z.infer<typeof ReembeddingRequestSchema>;

export const ReembeddingResponseSchema = z.object({
  tenantId: UUIDSchema,
  chunksReembedded: z.number().int(),
  model: z.string(),
  version: z.string(),
  dimension: z.number().int(),
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
  errors: z.array(z.string()).default([]),
});
export type ReembeddingResponse = z.infer<typeof ReembeddingResponseSchema>;

// Confidential Question Answer Key (AUDIT-04)
export const QuestionAnswerKeySchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  questionId: UUIDSchema,
  correctAnswer: z.string().min(1),
  gradingRubricJson: z.string().default("{}"),
  createdAt: z.string().datetime(),
});
export type QuestionAnswerKey = z.infer<typeof QuestionAnswerKeySchema>;
