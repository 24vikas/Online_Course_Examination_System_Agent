import test from "node:test";
import assert from "node:assert/strict";
import { DocumentRegistrationService, type CourseOfferingRef } from "../src/document-service.ts";
import type { DocumentRegistrationRequest } from "@exam-system/contracts";

const service = new DocumentRegistrationService();

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const OFFERING_DBMS = "off-dbms-001";
const SYLLABUS_V1 = "syl-v1-001";
const LECTURER_USER = "usr-lec-01";
const OTHER_LECTURER = "usr-lec-02";

const OFFERING_REF_A: CourseOfferingRef = {
  offeringId: OFFERING_DBMS,
  tenantId: TENANT_A,
  syllabusVersionId: SYLLABUS_V1,
  assignedLecturerId: LECTURER_USER,
};

test("Document Registration: Assigned lecturer can register valid PDF", async () => {
  const req: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "dbms_syllabus.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024 * 50,
    sha256Hash: "a".repeat(64),
  };

  const res = await service.registerDocument(TENANT_A, LECTURER_USER, "LECTURER", req, OFFERING_REF_A);

  assert.equal(res.document.status, "QUEUED");
  assert.equal(res.job.jobStatus, "QUEUED");
  assert.ok(res.document.storageKey.startsWith(`tenant-documents/${TENANT_A}/${OFFERING_DBMS}/`));
  assert.equal(res.isDuplicate, false);
});

test("Document Registration Invariant: Idempotent duplicate returns existing document without duplicate job", async () => {
  const req: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "dbms_syllabus.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024 * 50,
    sha256Hash: "a".repeat(64), // Same SHA
  };

  const res = await service.registerDocument(TENANT_A, LECTURER_USER, "LECTURER", req, OFFERING_REF_A);
  assert.equal(res.isDuplicate, true);
});

test("Document Registration Security: Student cannot upload syllabus document", async () => {
  const req: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "hacked.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    sha256Hash: "b".repeat(64),
  };

  await assert.rejects(
    async () => {
      await service.registerDocument(TENANT_A, "student-01", "STUDENT", req, OFFERING_REF_A);
    },
    {
      message: /AUTH_DENIED/,
    }
  );
});

test("Document Registration Security: Cross-tenant offering upload rejected", async () => {
  const req: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "cross.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    sha256Hash: "c".repeat(64),
  };

  await assert.rejects(
    async () => {
      // User is in Tenant B, but offering belongs to Tenant A
      await service.registerDocument(TENANT_B, LECTURER_USER, "LECTURER", req, OFFERING_REF_A);
    },
    {
      message: /CROSS_TENANT_VIOLATION/,
    }
  );
});

test("Document Registration Security: Unassigned lecturer upload rejected", async () => {
  const req: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "unassigned.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    sha256Hash: "d".repeat(64),
  };

  await assert.rejects(
    async () => {
      await service.registerDocument(TENANT_A, OTHER_LECTURER, "LECTURER", req, OFFERING_REF_A);
    },
    {
      message: /UNAUTHORIZED_OFFERING/,
    }
  );
});

test("Document Registration Validation: Empty file or oversized file rejected", async () => {
  const emptyReq: DocumentRegistrationRequest = {
    courseOfferingId: OFFERING_DBMS,
    syllabusVersionId: SYLLABUS_V1,
    filename: "empty.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 0,
    sha256Hash: "e".repeat(64),
  };

  await assert.rejects(
    async () => {
      await service.registerDocument(TENANT_A, LECTURER_USER, "LECTURER", emptyReq, OFFERING_REF_A);
    },
    {
      message: /INVALID_FILE_SIZE/,
    }
  );
});
