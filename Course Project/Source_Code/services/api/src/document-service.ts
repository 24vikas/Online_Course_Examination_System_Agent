import crypto from "crypto";
import type {
  DocumentRegistrationRequest,
  DocumentMetadata,
  DocumentIngestionJob,
} from "@exam-system/contracts";

export interface CourseOfferingRef {
  offeringId: string;
  tenantId: string;
  syllabusVersionId: string;
  assignedLecturerId: string;
}

export interface DocumentStorageProvider {
  storePrivateDocument(
    storageKey: string,
    content: Buffer,
    mimeType: string
  ): Promise<{ storageKey: string; size: number }>;
}

export class DocumentRegistrationService {
  private documentsStore: Map<string, DocumentMetadata> = new Map();
  private jobsStore: Map<string, DocumentIngestionJob> = new Map();

  /**
   * Registers a document upload intent after verifying tenant, offering, and syllabus authorization.
   * Generates secure private server storage paths and enqueues an ingestion job.
   */
  async registerDocument(
    tenantId: string,
    uploaderUserId: string,
    uploaderRole: "COE_ADMIN" | "LECTURER" | "STUDENT",
    req: DocumentRegistrationRequest,
    offeringRef: CourseOfferingRef
  ): Promise<{
    document: DocumentMetadata;
    job: DocumentIngestionJob;
    isDuplicate: boolean;
  }> {
    // 1. Role Authorization Gate: Students cannot upload syllabus/course source documents
    if (uploaderRole !== "COE_ADMIN" && uploaderRole !== "LECTURER") {
      throw new Error("AUTH_DENIED: Only COE_ADMIN and assigned LECTURER roles may upload course documents.");
    }

    // 2. Tenant & Offering Scope Verification
    if (offeringRef.tenantId !== tenantId) {
      throw new Error("CROSS_TENANT_VIOLATION: Course offering does not belong to active tenant.");
    }

    if (offeringRef.offeringId !== req.courseOfferingId) {
      throw new Error("INVALID_OFFERING: Offering ID does not match registration request.");
    }

    if (offeringRef.syllabusVersionId !== req.syllabusVersionId) {
      throw new Error("INVALID_SYLLABUS_VERSION: Course offering is not associated with this syllabus version.");
    }

    // If caller is lecturer, verify they are assigned to this offering (COE_ADMIN can override)
    if (uploaderRole === "LECTURER" && offeringRef.assignedLecturerId !== uploaderUserId) {
      throw new Error("UNAUTHORIZED_OFFERING: Lecturer is not assigned to teach this course offering.");
    }

    // 3. File Signature & Size Bounds Validation
    if (req.fileSizeBytes <= 0) {
      throw new Error("INVALID_FILE_SIZE: Empty (0-byte) files cannot be ingested.");
    }

    const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
    if (req.fileSizeBytes > MAX_SIZE_BYTES) {
      throw new Error("FILE_TOO_LARGE: Uploaded file exceeds the 100MB maximum limit.");
    }

    const ALLOWED_MIMES = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/markdown",
    ];
    if (!ALLOWED_MIMES.includes(req.mimeType)) {
      throw new Error(`UNSUPPORTED_FORMAT: MIME type '${req.mimeType}' is not supported for ingestion.`);
    }

    // 4. Idempotency Check: (tenant_id, course_offering_id, sha256_hash)
    const idempotencyKey = `${tenantId}:${req.courseOfferingId}:${req.sha256Hash}`;
    const existingDoc = this.documentsStore.get(idempotencyKey);
    if (existingDoc) {
      const existingJob = this.jobsStore.get(existingDoc.id);
      return {
        document: existingDoc,
        job: existingJob || {
          id: crypto.randomUUID(),
          tenantId,
          documentId: existingDoc.id,
          jobStatus: "SUCCEEDED",
          attemptCount: 1,
          maxAttempts: 3,
          createdAt: existingDoc.createdAt,
        },
        isDuplicate: true,
      };
    }

    // 5. Generate Server-Authoritative Storage Key (Never client controlled)
    const docId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const ext = req.filename.split(".").pop() || "bin";
    const storageKey = `tenant-documents/${tenantId}/${req.courseOfferingId}/${docId}/${req.sha256Hash}.${ext}`;

    const now = new Date().toISOString();
    const document: DocumentMetadata = {
      id: docId,
      tenantId,
      courseOfferingId: req.courseOfferingId,
      syllabusVersionId: req.syllabusVersionId,
      filename: req.filename,
      storageKey,
      mimeType: req.mimeType,
      fileSizeBytes: req.fileSizeBytes,
      sha256Hash: req.sha256Hash,
      status: "QUEUED",
      uploadedBy: uploaderUserId,
      createdAt: now,
      updatedAt: now,
    };

    const job: DocumentIngestionJob = {
      id: jobId,
      tenantId,
      documentId: docId,
      jobStatus: "QUEUED",
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: now,
    };

    this.documentsStore.set(idempotencyKey, document);
    this.jobsStore.set(docId, job);

    return { document, job, isDuplicate: false };
  }

  getDocument(docId: string, tenantId: string): DocumentMetadata | null {
    for (const doc of Array.from(this.documentsStore.values())) {
      if (doc.id === docId && doc.tenantId === tenantId) {
        return doc;
      }
    }
    return null;
  }
}
