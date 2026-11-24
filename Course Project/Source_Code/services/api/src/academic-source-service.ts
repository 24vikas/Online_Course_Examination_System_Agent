/**
 * Academic Data Onboarding & Provenance Management Service
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { DatabaseClient } from "./ai-provider-service.ts";

export type DocumentProvenanceStatus = "AUTHORITATIVE" | "SUPERSEDED" | "UNVERIFIED" | "LEGACY";
export type AcademicDocumentCategory =
  | "SYLLABUS"
  | "LEARNING_PORTFOLIO"
  | "COURSE_PLAN"
  | "SLIDES"
  | "TEXTBOOK"
  | "ASSIGNMENT_WORKLET";

export interface DiscoveredSourceFile {
  filename: string;
  relativePath: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  inferredCourseCode: string;
  inferredSemester: number | null;
  inferredCategory: AcademicDocumentCategory;
  inferredSubject: string;
  existingDocumentId?: string;
  existingStatus?: string;
  provenanceStatus?: DocumentProvenanceStatus;
  chunkCount?: number;
}

export interface IngestSourceInput {
  filename: string;
  courseCode: string;
  semester: number;
  academicYear?: string;
  category: AcademicDocumentCategory;
  provenanceStatus: DocumentProvenanceStatus;
  adminNotes?: string;
  supersedesDocumentId?: string;
  textContent?: string; // Optional raw text if pre-extracted
}

export class AcademicSourceService {
  private db: DatabaseClient;
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Scans a target directory (default 'data store') and discovers candidate documents.
   * If directory is empty, includes root course reference documents (e.g., AAI_26ECAC401.docx).
   */
  scanSourceDirectory(rootDir: string, dataStoreSubdir: string = "data store"): DiscoveredSourceFile[] {
    const targetDir = path.resolve(rootDir, dataStoreSubdir);
    const discovered: DiscoveredSourceFile[] = [];

    const supportedExts: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".txt": "text/plain",
      ".md": "text/markdown",
    };

    const processFile = (filePath: string, relativePath: string) => {
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (!supportedExts[ext]) return;

        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) return;

        const buffer = fs.readFileSync(filePath);
        const hash = crypto.createHash("sha256").update(buffer).digest("hex");
        const filename = path.basename(filePath);

        // Metadata heuristics
        let inferredCourseCode = "26ECAC401";
        const codeMatch = filename.match(/([0-9]{2}[A-Z]{2,4}[0-9]{3})/i);
        if (codeMatch) inferredCourseCode = codeMatch[1].toUpperCase();

        let inferredSemester: number | null = 7;
        const semDirMatch = filePath.match(/([357])_Semester/i);
        const semFileMatch = filename.match(/SEM(?:ESTER)?[_\s-]*([357])/i);
        if (semDirMatch) {
          inferredSemester = parseInt(semDirMatch[1], 10);
        } else if (semFileMatch) {
          inferredSemester = parseInt(semFileMatch[1], 10);
        }

        let inferredCategory: AcademicDocumentCategory = "SYLLABUS";
        const lower = filename.toLowerCase();
        if (lower.includes("lp") || lower.includes("portfolio")) {
          inferredCategory = "LEARNING_PORTFOLIO";
        } else if (lower.includes("canvas") || lower.includes("worklet")) {
          inferredCategory = "ASSIGNMENT_WORKLET";
        } else if (lower.includes("slide") || lower.includes("lecture")) {
          inferredCategory = "SLIDES";
        } else if (lower.includes("book") || lower.includes("textbook")) {
          inferredCategory = "TEXTBOOK";
        } else if (lower.includes("plan")) {
          inferredCategory = "COURSE_PLAN";
        }

        let inferredSubject = "Agentic AI";
        if (lower.includes("agentic") || inferredCourseCode === "26ECAC401") inferredSubject = "Agentic AI";
        else if (lower.includes("dbms") || lower.includes("dba")) inferredSubject = "Database Management Systems";
        else if (lower.includes("algorithm") || lower.includes("daa")) inferredSubject = "Design & Analysis of Algorithms";
        else if (lower.includes("software engineering")) inferredSubject = "Software Engineering";
        else if (lower.includes("cryptography") || lower.includes("cns")) inferredSubject = "Cryptography & Network Security";
        else if (lower.includes("dl") || lower.includes("deep learning")) inferredSubject = "Deep Learning";
        else if (lower.includes("parallel gpu")) inferredSubject = "Parallel GPU Computing";
        else if (lower.includes("bda") || lower.includes("big data")) inferredSubject = "Big Data Analytics";
        else if (lower.includes("ospp")) inferredSubject = "Operating Systems & Parallel Programming";
        else if (lower.includes("wt") || lower.includes("web")) inferredSubject = "Web Technologies";
        else if (lower.includes("sdp")) inferredSubject = "Software Development Project";
        else if (lower.includes("ai-assisted")) inferredSubject = "AI-Assisted Programming & SD";
        else if (inferredCourseCode.includes("CS")) inferredSubject = "Computer Science Core";

        discovered.push({
          filename,
          relativePath,
          fileSizeBytes: stat.size,
          mimeType: supportedExts[ext],
          sha256Hash: hash,
          inferredCourseCode,
          inferredSemester,
          inferredCategory,
          inferredSubject,
        });
      } catch {
        // Skip unreadable files safely
      }
    };

    const walkDir = (dir: string, baseSubdir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "README.md" || entry.name.endsWith(".zip")) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(baseSubdir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath, relPath);
        } else if (entry.isFile()) {
          processFile(fullPath, relPath);
        }
      }
    };

    walkDir(targetDir, dataStoreSubdir);

    // Fallback: If no files in data store, scan root directory for authoritative course materials
    if (discovered.length === 0) {
      const rootCandidates = ["AAI_26ECAC401.docx", "Team_AURA_Agentic_AI_Worklet_Canvas.pptx"];
      for (const cand of rootCandidates) {
        const full = path.join(rootDir, cand);
        if (fs.existsSync(full)) {
          processFile(full, cand);
        }
      }
    }

    return discovered;
  }

  /**
   * Correlates discovered files with PostgreSQL database documents records.
   */
  async listSources(tenantId: string, rootDir: string, dataStoreSubdir: string = "data store"): Promise<DiscoveredSourceFile[]> {
    const discovered = this.scanSourceDirectory(rootDir, dataStoreSubdir);
    if (discovered.length === 0) return [];

    const hashes = discovered.map((d) => d.sha256Hash);
    const dbDocs = await this.db.query(
      `
      SELECT d.id, d.filename, d.sha256_hash, d.status, d.provenance_status,
             count(dc.id)::int as chunk_count
      FROM documents d
      LEFT JOIN document_chunks dc ON dc.document_id = d.id
      WHERE d.tenant_id = $1 AND d.sha256_hash = ANY($2::text[])
      GROUP BY d.id, d.filename, d.sha256_hash, d.status, d.provenance_status
      `,
      [tenantId, hashes]
    );

    const docMap = new Map<string, any>();
    for (const r of dbDocs.rows) {
      docMap.set(r.sha256_hash, r);
    }

    return discovered.map((file) => {
      const match = docMap.get(file.sha256Hash);
      if (match) {
        return {
          ...file,
          existingDocumentId: match.id,
          existingStatus: match.status,
          provenanceStatus: match.provenance_status || "AUTHORITATIVE",
          chunkCount: match.chunk_count || 0,
        };
      }
      return {
        ...file,
        provenanceStatus: "UNVERIFIED",
        chunkCount: 0,
      };
    });
  }

  /**
   * Ingests or approves an academic document, updating its provenance status and RAG visibility.
   * If marking this document AUTHORITATIVE and a superseded document is specified,
   * the older document is marked SUPERSEDED and its chunks are excluded from retrieval.
   */
  async ingestSource(
    tenantId: string,
    uploaderId: string,
    uploaderRole: "COE_ADMIN" | "LECTURER",
    input: IngestSourceInput,
    courseOfferingId: string,
    syllabusVersionId: string
  ): Promise<{ documentId: string; status: string; provenanceStatus: string; supersededCount: number }> {
    if (uploaderRole !== "COE_ADMIN" && uploaderRole !== "LECTURER") {
      throw new Error("AUTH_DENIED: Only COE_ADMIN and LECTURER may ingest academic documents.");
    }

    // 1. Check if document already exists
    const existing = await this.db.query(
      `
      SELECT id, status, provenance_status
      FROM documents
      WHERE tenant_id = $1 AND course_offering_id = $2 AND filename = $3
      LIMIT 1
      `,
      [tenantId, courseOfferingId, input.filename]
    );

    let documentId: string;
    let supersededCount = 0;

    if (existing.rows.length > 0) {
      documentId = existing.rows[0].id;
      await this.db.query(
        `
        UPDATE documents
        SET provenance_status = $1,
            semester = $2,
            academic_year = $3,
            document_category = $4,
            admin_notes = $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 AND tenant_id = $7
        `,
        [
          input.provenanceStatus,
          input.semester,
          input.academicYear || "AY 2026-27",
          input.category,
          input.adminNotes || "Approved via Academic Source Onboarding",
          documentId,
          tenantId,
        ]
      );
    } else {
      // Create new document record
      const docRes = await this.db.query(
        `
        INSERT INTO documents (
          tenant_id, course_offering_id, syllabus_version_id, filename,
          storage_key, mime_type, file_size_bytes, sha256_hash,
          status, uploaded_by, provenance_status, semester, academic_year,
          document_category, admin_notes
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          'READY', $9, $10, $11, $12,
          $13, $14
        )
        RETURNING id
        `,
        [
          tenantId,
          courseOfferingId,
          syllabusVersionId,
          input.filename,
          `courses/${courseOfferingId}/docs/${input.filename}`,
          "application/octet-stream",
          1024,
          crypto.createHash("sha256").update(input.filename).digest("hex"),
          uploaderId,
          input.provenanceStatus,
          input.semester,
          input.academicYear || "AY 2026-27",
          input.category,
          input.adminNotes || "Ingested via Academic Source Service",
        ]
      );
      documentId = docRes.rows[0].id;
    }

    // 2. Handle Superseded Document logic
    if (input.supersedesDocumentId && input.provenanceStatus === "AUTHORITATIVE") {
      const supRes = await this.db.query(
        `
        UPDATE documents
        SET provenance_status = 'SUPERSEDED',
            superseded_by_document_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND tenant_id = $3
        `,
        [documentId, input.supersedesDocumentId, tenantId]
      );

      // Exclude superseded document's chunks from retrieval
      await this.db.query(
        `
        UPDATE document_chunks
        SET is_active_for_retrieval = FALSE
        WHERE document_id = $1 AND tenant_id = $2
        `,
        [input.supersedesDocumentId, tenantId]
      );

      supersededCount = supRes.rows.length;
    }

    // 3. Ensure active chunks for current document
    const isActive = input.provenanceStatus !== "SUPERSEDED";
    await this.db.query(
      `
      UPDATE document_chunks
      SET is_active_for_retrieval = $1
      WHERE document_id = $2 AND tenant_id = $3
      `,
      [isActive, documentId, tenantId]
    );

    return {
      documentId,
      status: "READY",
      provenanceStatus: input.provenanceStatus,
      supersededCount,
    };
  }
}
