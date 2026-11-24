import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import type { DocumentChunkItem } from "@exam-system/contracts";
import { DocumentChunker } from "./chunker.ts";
import { HttpDoclingClient, type DoclingClient } from "./docling-client.ts";
import { SelfHostedBgeM3Provider, type EmbeddingProvider } from "./embedding-provider.ts";
import { validateUploadFile, type FileValidationResult } from "./file-validator.ts";

export interface IngestionOptions {
  tenantId: string;
  courseOfferingId: string;
  syllabusVersionId: string;
  uploadedBy?: string;
  filename: string;
  fileBuffer: Buffer;
  declaredMimeType?: string;
  dbPool?: Pool;
  doclingClient?: DoclingClient;
  embeddingProvider?: EmbeddingProvider;
}

export interface IngestionTimings {
  validationMs: number;
  extractionMs: number;
  chunkingMs: number;
  embeddingMs: number;
  indexingMs: number;
  totalMs: number;
}

export interface IngestionResult {
  success: boolean;
  documentId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string;
  status: "READY" | "FAILED";
  totalPages: number;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimension: number;
  chunks: Array<{
    id: string;
    chunkIndex: number;
    pageStart: number;
    pageEnd: number;
    sectionHeader: string;
    elementType: string;
    content: string;
    contentHash: string;
    citationLocator: string;
  }>;
  timings: IngestionTimings;
  error?: string;
}

export interface StagingSyllabusCheckResult {
  status: "READY" | "BLOCKED";
  found: boolean;
  activeCourseCode: string;
  resolvedPath?: string;
  missingFile?: string;
  reason?: string;
  availableStagedPdfs: Array<{
    filename: string;
    path: string;
    sizeBytes: number;
    semester?: number;
  }>;
}

/**
 * Executes full knowledge ingestion pipeline:
 * UPLOAD -> VALIDATE -> EXTRACT (Docling on port 5001) -> CHUNK -> EMBED (BGE-M3 1024-d on port 8002) -> pgvector on port 54322 -> READY
 */
export async function runIngestionPipeline(options: IngestionOptions): Promise<IngestionResult> {
  const t0 = Date.now();
  const timings: IngestionTimings = {
    validationMs: 0,
    extractionMs: 0,
    chunkingMs: 0,
    embeddingMs: 0,
    indexingMs: 0,
    totalMs: 0,
  };

  const documentId = crypto.randomUUID();
  const uploadedBy = options.uploadedBy || "d1111111-1111-1111-1111-111111111111"; // Default COE admin

  // STEP 1: VALIDATE (MIME, magic bytes, size limits)
  const valStart = Date.now();
  const validation: FileValidationResult = validateUploadFile(
    options.fileBuffer,
    options.filename,
    options.declaredMimeType
  );
  timings.validationMs = Date.now() - valStart;

  if (!validation.valid) {
    throw new Error(`VALIDATION_FAILED: ${validation.error}`);
  }

  // STEP 2: EXTRACT (Docling on port 5001)
  const extStart = Date.now();
  const doclingClient = options.doclingClient || new HttpDoclingClient();
  const conversion = await doclingClient.convertDocument(
    documentId,
    options.fileBuffer,
    options.filename
  );
  timings.extractionMs = Date.now() - extStart;

  // STEP 3: CHUNK (Heading-aware, preserving page references)
  const chunkStart = Date.now();
  const chunker = new DocumentChunker();
  const chunks: DocumentChunkItem[] = chunker.chunkDocument(
    options.tenantId,
    options.courseOfferingId,
    options.syllabusVersionId,
    conversion
  );
  timings.chunkingMs = Date.now() - chunkStart;

  if (chunks.length === 0) {
    throw new Error("INGESTION_ERROR: Document contains no extractable text chunks.");
  }

  // STEP 4: EMBED (BGE-M3 1024-d on port 8002)
  const embedStart = Date.now();
  const embeddingProvider = options.embeddingProvider || new SelfHostedBgeM3Provider();
  const chunkTexts = chunks.map((c) => c.content);
  const embeddingResult = await embeddingProvider.embedTexts(chunkTexts);
  timings.embeddingMs = Date.now() - embedStart;

  if (embeddingResult.vectors.length !== chunks.length) {
    throw new Error(
      `EMBEDDING_COUNT_MISMATCH: Expected ${chunks.length} vectors, got ${embeddingResult.vectors.length}`
    );
  }

  // STEP 5: pgvector storage on port 54322
  const idxStart = Date.now();
  if (options.dbPool) {
    const pool = options.dbPool;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert into documents table
      const storageKey = `tenant-documents/${options.tenantId}/${options.courseOfferingId}/${documentId}/${options.filename}`;
      await client.query(
        `INSERT INTO documents (
          id, tenant_id, course_offering_id, syllabus_version_id, filename,
          storage_key, mime_type, file_size_bytes, sha256_hash, status,
          uploaded_by, provenance_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = NOW()`,
        [
          documentId,
          options.tenantId,
          options.courseOfferingId,
          options.syllabusVersionId,
          options.filename,
          storageKey,
          validation.mimeType,
          validation.fileSizeBytes,
          validation.sha256Hash,
          "READY",
          uploadedBy,
          "AUTHORITATIVE",
        ]
      );

      // Insert into document_chunks table
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const vec = embeddingResult.vectors[i];
        const vectorParam = `[${vec.join(",")}]`;

        await client.query(
          `INSERT INTO document_chunks (
            id, tenant_id, course_offering_id, syllabus_version_id, document_id,
            chunk_index, content, content_hash, page_start, page_end,
            section_header, element_type, embedding, embedding_dimension,
            embedding_model, embedding_version, embedding_provider,
            is_active_for_retrieval, embedding_status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
          ON CONFLICT (id) DO UPDATE SET
            embedding = EXCLUDED.embedding,
            content = EXCLUDED.content,
            is_active_for_retrieval = EXCLUDED.is_active_for_retrieval`,
          [
            c.id,
            options.tenantId,
            options.courseOfferingId,
            options.syllabusVersionId,
            documentId,
            c.chunkIndex,
            c.content,
            c.contentHash,
            c.pageStart,
            c.pageEnd,
            c.sectionHeader || "Course Content",
            c.elementType || "paragraph",
            vectorParam,
            embeddingResult.dimension,
            embeddingResult.model,
            embeddingResult.version,
            embeddingResult.provider,
            true,
            "COMPLETED",
          ]
        );
      }

      await client.query("COMMIT");
    } catch (dbErr) {
      await client.query("ROLLBACK");
      throw dbErr;
    } finally {
      client.release();
    }
  }
  timings.indexingMs = Date.now() - idxStart;
  timings.totalMs = Date.now() - t0;

  // Format return chunks
  const returnChunks = chunks.map((c) => {
    const isPptx = options.filename.endsWith(".pptx");
    const citationLocator = isPptx
      ? `${options.filename}#slide=${c.pageStart}`
      : `${options.filename}#page=${c.pageStart}&section=${encodeURIComponent(c.sectionHeader || "content")}`;
    return {
      id: c.id,
      chunkIndex: c.chunkIndex,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      sectionHeader: c.sectionHeader || "Course Content",
      elementType: c.elementType || "paragraph",
      content: c.content,
      contentHash: c.contentHash,
      citationLocator,
    };
  });

  return {
    success: true,
    documentId,
    filename: options.filename,
    mimeType: validation.mimeType,
    fileSizeBytes: validation.fileSizeBytes,
    sha256Hash: validation.sha256Hash,
    status: "READY",
    totalPages: conversion.totalPages,
    chunkCount: chunks.length,
    embeddingModel: embeddingResult.model,
    embeddingDimension: embeddingResult.dimension,
    chunks: returnChunks,
    timings,
  };
}

/**
 * Searches workspace / staging for syllabus PDFs.
 * If the authoritative syllabus PDF is absent on disk, returns status: "BLOCKED"
 * with the exact missing file required.
 */
export function checkSyllabusPdfStaging(
  courseCode: string = "26ECAC401",
  baseDir: string = process.cwd()
): StagingSyllabusCheckResult {
  // Resolve repository root directory if baseDir is a service subdirectory
  let rootDir = baseDir;
  if (!fs.existsSync(path.join(rootDir, "data store")) && fs.existsSync(path.join(rootDir, "..", "data store"))) {
    rootDir = path.resolve(rootDir, "..");
  } else if (!fs.existsSync(path.join(rootDir, "data store")) && fs.existsSync(path.join(rootDir, "..", "..", "data store"))) {
    rootDir = path.resolve(rootDir, "..", "..");
  }

  // Authoritative candidate paths for course syllabus PDFs
  const targetPdfFilename =
    courseCode === "26ECAC401"
      ? "Agentic_AI_Lesson_Plan_26ECAC401_Final.pdf"
      : `${courseCode}_Syllabus_Curriculum.pdf`;

  const candidatePaths = [
    path.join(rootDir, "data store", "7_Semester", "Integrated_Course", targetPdfFilename),
    path.join(rootDir, "data store", targetPdfFilename),
    path.join(rootDir, targetPdfFilename),
    path.join(rootDir, "data store", "7_Semester", "Integrated_Course", "AAI_26ECAC401_Agentic_AI_Curriculum.pdf"),
    path.join(rootDir, "AAI_26ECAC401.pdf"),
    path.join(rootDir, "CS301_Distributed_Systems_Curriculum.pdf"),
  ];

  // Inspect existing staging PDFs in data store
  const availableStagedPdfs: Array<{ filename: string; path: string; sizeBytes: number; semester?: number }> = [];

  const scanDirs = [
    { dir: path.join(rootDir, "data store", "3_Semester", "Integrated_Course"), sem: 3 },
    { dir: path.join(rootDir, "data store", "5_Semester", "Integrated_Course"), sem: 5 },
    { dir: path.join(rootDir, "data store", "7_Semester", "Integrated_Course"), sem: 7 },
    { dir: path.join(rootDir, "data", "fixtures"), sem: undefined },
  ];

  for (const item of scanDirs) {
    if (fs.existsSync(item.dir)) {
      try {
        const files = fs.readdirSync(item.dir);
        for (const file of files) {
          if (file.toLowerCase().endsWith(".pdf")) {
            const fullPath = path.join(item.dir, file);
            const stat = fs.statSync(fullPath);
            availableStagedPdfs.push({
              filename: file,
              path: fullPath,
              sizeBytes: stat.size,
              semester: item.sem,
            });
          }
        }
      } catch {
        // Continue
      }
    }
  }

  // Check if any candidate for the active syllabus PDF exists
  let foundPath: string | undefined;
  for (const cPath of candidatePaths) {
    if (fs.existsSync(cPath)) {
      foundPath = cPath;
      break;
    }
  }

  if (foundPath) {
    return {
      status: "READY",
      found: true,
      activeCourseCode: courseCode,
      resolvedPath: foundPath,
      availableStagedPdfs,
    };
  }

  // If absent on disk, mark BLOCKED with the exact missing file required
  const missingFile = path.join("data store", "7_Semester", "Integrated_Course", targetPdfFilename);
  return {
    status: "BLOCKED",
    found: false,
    activeCourseCode: courseCode,
    missingFile,
    reason: `Authoritative syllabus PDF for ${courseCode} absent on disk. Expected at '${missingFile}'. Note: Source DOCX ('Agentic_AI_Lesson_Plan_26ECAC401_Final.docx') is staged in data store. Upload or compile syllabus PDF to unblock.`,
    availableStagedPdfs,
  };
}
