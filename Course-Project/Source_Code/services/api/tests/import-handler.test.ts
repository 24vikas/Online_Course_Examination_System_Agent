import test from "node:test";
import assert from "node:assert/strict";
import { RosterImportPipeline, type BatchRef, type ExistingStudentRef } from "../src/import-handler.ts";

const pipeline = new RosterImportPipeline();

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

const KNOWN_BATCHES: BatchRef[] = [
  { batchCode: "CSE-2026-A", batchId: "b-01", tenantId: TENANT_A },
  { batchCode: "CSE-2026-B", batchId: "b-02", tenantId: TENANT_A },
  { batchCode: "TENANT-B-BATCH", batchId: "b-03", tenantId: TENANT_B },
];

const EXISTING_STUDENTS: ExistingStudentRef[] = [
  { institutionalStudentId: "SYN-STU-001", studentId: "s-01", tenantId: TENANT_A },
];

test("Roster Import: Valid rows produce VALIDATED_CLEAN dry-run preview", () => {
  const rows = [
    {
      institutionalStudentId: "SYN-STU-101",
      firstName: "Alex",
      lastName: "R",
      email: "alex.r@synth.kletech.ac.in",
      batchCode: "CSE-2026-A",
    },
    {
      institutionalStudentId: "SYN-STU-102",
      firstName: "Jordan",
      lastName: "M",
      email: "jordan.m@synth.kletech.ac.in",
      batchCode: "CSE-2026-B",
    },
  ];

  const preview = pipeline.validateRosterRows(TENANT_A, rows, KNOWN_BATCHES, EXISTING_STUDENTS);

  assert.equal(preview.status, "VALIDATED_CLEAN");
  assert.equal(preview.totalRows, 2);
  assert.equal(preview.validRows, 2);
  assert.equal(preview.errorCount, 0);
  assert.deepEqual(preview.detectedBatches.sort(), ["CSE-2026-A", "CSE-2026-B"]);
});

test("Roster Import: In-file duplicate student ID is flagged", () => {
  const rows = [
    {
      institutionalStudentId: "SYN-STU-DUP",
      firstName: "User1",
      email: "u1@synth.kletech.ac.in",
      batchCode: "CSE-2026-A",
    },
    {
      institutionalStudentId: "SYN-STU-DUP",
      firstName: "User2",
      email: "u2@synth.kletech.ac.in",
      batchCode: "CSE-2026-A",
    },
  ];

  const preview = pipeline.validateRosterRows(TENANT_A, rows, KNOWN_BATCHES, EXISTING_STUDENTS);

  assert.equal(preview.status, "VALIDATED_WITH_ERRORS");
  assert.equal(preview.validRows, 1);
  assert.equal(preview.errorCount, 1);
  assert.equal(preview.errors[0]?.errorCode, "ERR_DUPLICATE_ID_IN_FILE");
  assert.equal(preview.errors[0]?.rowNumber, 2);
});

test("Roster Import: Unknown batch reference is flagged", () => {
  const rows = [
    {
      institutionalStudentId: "SYN-STU-103",
      firstName: "Morgan",
      email: "morgan@synth.kletech.ac.in",
      batchCode: "NONEXISTENT_BATCH_99",
    },
  ];

  const preview = pipeline.validateRosterRows(TENANT_A, rows, KNOWN_BATCHES, EXISTING_STUDENTS);

  assert.equal(preview.status, "VALIDATED_WITH_ERRORS");
  assert.equal(preview.errors[0]?.errorCode, "ERR_UNKNOWN_BATCH_REFERENCE");
});

test("Roster Import: Cross-tenant batch code reference is rejected", () => {
  // Batch belongs to TENANT_B, but import is targeting TENANT_A
  const rows = [
    {
      institutionalStudentId: "SYN-STU-104",
      firstName: "Taylor",
      email: "taylor@synth.kletech.ac.in",
      batchCode: "TENANT-B-BATCH",
    },
  ];

  const preview = pipeline.validateRosterRows(TENANT_A, rows, KNOWN_BATCHES, EXISTING_STUDENTS);

  assert.equal(preview.status, "VALIDATED_WITH_ERRORS");
  assert.equal(preview.errors[0]?.errorCode, "ERR_UNKNOWN_BATCH_REFERENCE");
});

test("Roster Import: Missing required fields and malformed email flagged", () => {
  const rows = [
    {
      institutionalStudentId: "", // missing
      firstName: "NoID",
      email: "not-an-email", // malformed
      batchCode: "CSE-2026-A",
    },
  ];

  const preview = pipeline.validateRosterRows(TENANT_A, rows, KNOWN_BATCHES, EXISTING_STUDENTS);

  assert.equal(preview.status, "VALIDATED_WITH_ERRORS");
  const errorCodes = preview.errors.map((e) => e.errorCode);
  assert.ok(errorCodes.includes("ERR_MISSING_REQUIRED_FIELD"));
  assert.ok(errorCodes.includes("ERR_MALFORMED_EMAIL"));
});

test("Roster Import Invariant: Commit creates batch memberships but strictly ZERO course enrolments", () => {
  const validatedRows = [
    {
      institutionalStudentId: "SYN-STU-201",
      firstName: "Casey",
      lastName: "C",
      email: "casey@synth.kletech.ac.in",
      batchCode: "CSE-2026-A",
    },
  ];

  const result = pipeline.simulateCommit(
    TENANT_A,
    "import-uuid-123",
    validatedRows,
    "sha256-hash-fake",
    "admin-uuid-001"
  );

  assert.equal(result.committedStudents, 1);
  assert.equal(result.committedBatchMemberships, 1);
  // Non-negotiable architectural invariant:
  assert.equal(result.enrolmentsCreated, 0, "Roster import must never create course enrolments!");
  assert.equal(result.importRecord.status, "COMMITTED");
});
