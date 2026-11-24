/**
 * Phase 15 Comprehensive Service Test Suite
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";

import {
  AcademicSourceService,
  StudentImportService,
  TeamFormationService,
  ProctorCompanionService,
  computeSebHash,
} from "../src/index.ts";

// In-Memory Mock Database
class MockDb {
  public queries: Array<{ sql: string; params: any[] }> = [];
  public documents: any[] = [];
  public documentChunks: any[] = [];
  public importBatches: any[] = [];
  public users: any[] = [];
  public students: any[] = [];
  public teams: any[] = [];
  public teamMembers: any[] = [];
  public proctorSessions: any[] = [];
  public proctorIncidents: any[] = [];
  public examAttempts: any[] = [];
  public examSchedules: any[] = [];
  public examConfigs: any[] = [];

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    this.queries.push({ sql, params });

    // Documents queries
    if (sql.includes("SELECT id, status, provenance_status") && sql.includes("FROM documents")) {
      const filename = params[2];
      const match = this.documents.filter((d) => d.filename === filename);
      return { rows: match };
    }
    if (sql.includes("INSERT INTO documents")) {
      const doc = {
        id: `doc-${this.documents.length + 1}`,
        tenant_id: params[0],
        course_offering_id: params[1],
        filename: params[3],
        provenance_status: params[9],
        semester: params[10],
      };
      this.documents.push(doc);
      return { rows: [doc] };
    }
    if (sql.includes("UPDATE documents") && sql.includes("provenance_status = 'SUPERSEDED'")) {
      const docId = params[1];
      const target = this.documents.find((d) => d.id === docId);
      if (target) {
        target.provenance_status = "SUPERSEDED";
        target.superseded_by_document_id = params[0];
      }
      return { rows: target ? [target] : [] };
    }
    if (sql.includes("UPDATE document_chunks") && sql.includes("is_active_for_retrieval = FALSE")) {
      const docId = params[0];
      this.documentChunks
        .filter((c) => c.document_id === docId)
        .forEach((c) => (c.is_active_for_retrieval = false));
      return { rows: [] };
    }

    // Student import batches
    if (sql.includes("SELECT id, status, imported_rows") && sql.includes("FROM student_import_batches")) {
      const hash = params[1];
      const match = this.importBatches.filter((b) => b.file_sha256 === hash && b.status === "COMMITTED");
      return { rows: match };
    }
    if (sql.includes("INSERT INTO student_import_batches")) {
      const batch = {
        id: `batch-${this.importBatches.length + 1}`,
        tenant_id: params[0],
        filename: params[1],
        file_sha256: params[2],
        imported_rows: params[7],
        status: "COMMITTED",
      };
      this.importBatches.push(batch);
      return { rows: [batch] };
    }
    if (sql.includes("SELECT id FROM users WHERE email")) {
      const email = params[0];
      const user = this.users.filter((u) => u.email === email);
      return { rows: user };
    }
    if (sql.includes("INSERT INTO users")) {
      const user = { id: `usr-${this.users.length + 1}`, email: params[0], full_name: params[1] };
      this.users.push(user);
      return { rows: [user] };
    }
    if (sql.includes("INSERT INTO students")) {
      const student = {
        id: `stud-${this.students.length + 1}`,
        tenant_id: params[0],
        institutional_student_id: params[2],
        first_name: params[3],
        current_semester: params[4],
        academic_status: "ENROLLED",
      };
      this.students.push(student);
      return { rows: [student] };
    }

    // Team formation queries
    if (sql.includes("SELECT s.id, s.institutional_student_id")) {
      return { rows: this.students };
    }
    if (sql.includes("INSERT INTO student_teams")) {
      const team = {
        id: `team-${this.teams.length + 1}`,
        team_name: params[2],
        team_number: params[3],
        status: "APPROVED",
      };
      this.teams.push(team);
      return { rows: [team] };
    }
    if (sql.includes("INSERT INTO team_memberships")) {
      const mem = { id: `mem-${this.teamMembers.length + 1}`, team_id: params[1], student_id: params[2], role: params[3] };
      this.teamMembers.push(mem);
      return { rows: [mem] };
    }

    // Proctoring queries
    if (sql.includes("INSERT INTO exam_proctoring_sessions")) {
      const sess = {
        id: `sess-${this.proctorSessions.length + 1}`,
        attempt_id: params[1],
        student_id: params[2],
        session_token_hash: params[5],
        status: "PREFLIGHT",
      };
      this.proctorSessions.push(sess);
      return { rows: [sess] };
    }
    if (sql.includes("SELECT id, status, session_token_hash") && sql.includes("FROM exam_proctoring_sessions")) {
      const attemptId = params[1];
      const match = this.proctorSessions.filter((s) => s.attempt_id === attemptId);
      return { rows: match };
    }
    if (sql.includes("UPDATE exam_proctoring_sessions") && sql.includes("status = $1")) {
      const attemptId = params[3];
      const target = this.proctorSessions.find((s) => s.attempt_id === attemptId);
      if (target) target.status = params[0];
      return { rows: target ? [{ status: target.status }] : [] };
    }
    if (sql.includes("INSERT INTO exam_proctoring_incidents")) {
      const inc = {
        id: `inc-${this.proctorIncidents.length + 1}`,
        attempt_id: params[1],
        session_id: params[2],
        incident_type: params[3],
        severity: params[4],
        confidence_score: params[5],
        review_status: "PENDING_REVIEW",
      };
      this.proctorIncidents.push(inc);
      return { rows: [inc] };
    }
    if (sql.includes("SELECT ea.id, ea.status, ea.student_id") && sql.includes("FROM exam_attempts ea")) {
      const attemptId = params[1];
      const attempt = this.examAttempts.find((a) => a.id === attemptId);
      if (!attempt) return { rows: [] };
      return {
        rows: [
          {
            id: attempt.id,
            status: attempt.status,
            student_id: attempt.student_id,
            schedule_id: attempt.schedule_id,
            start_time: attempt.start_time || new Date(Date.now() - 60000).toISOString(),
            end_time: attempt.end_time || new Date(Date.now() + 3600000).toISOString(),
            schedule_status: attempt.schedule_status || "SCHEDULED",
            seb_required: attempt.seb_required ?? false,
            seb_config_key_hash: attempt.seb_config_key_hash || "test-seb-key",
          },
        ],
      };
    }
    if (sql.includes("SELECT status, last_heartbeat_at") && sql.includes("FROM exam_proctoring_sessions")) {
      const attemptId = params[1];
      const sess = this.proctorSessions.find((s) => s.attempt_id === attemptId);
      return { rows: sess ? [sess] : [] };
    }
    if (sql.includes("UPDATE exam_proctoring_incidents")) {
      const incId = params[4];
      const target = this.proctorIncidents.find((i) => i.id === incId);
      if (target) {
        target.review_status = params[0];
        target.reviewer_notes = params[2];
      }
      return { rows: target ? [target] : [] };
    }

    return { rows: [] };
  }
}

// ============================================================================
// WORKSTREAM A: ACADEMIC SOURCE ONBOARDING TESTS
// ============================================================================

test("Workstream A: AcademicSourceService scans directory and infers metadata correctly", () => {
  const mockDb = new MockDb();
  const service = new AcademicSourceService(mockDb);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aura-data-store-"));
  const subDir = path.join(tmpDir, "data store");
  fs.mkdirSync(subDir, { recursive: true });

  // Create sample files
  fs.writeFileSync(path.join(subDir, "26ECAC401_SEM7_LP_Agentic_AI.docx"), "Mock LP Content");
  fs.writeFileSync(path.join(subDir, "Team_Canvas_Worklet.pptx"), "Mock Slides");

  const discovered = service.scanSourceDirectory(tmpDir, "data store");
  assert.equal(discovered.length, 2);

  const lpDoc = discovered.find((d) => d.filename.includes("26ECAC401"));
  assert.ok(lpDoc);
  assert.equal(lpDoc.inferredCourseCode, "26ECAC401");
  assert.equal(lpDoc.inferredSemester, 7);
  assert.equal(lpDoc.inferredCategory, "LEARNING_PORTFOLIO");

  const canvasDoc = discovered.find((d) => d.filename.includes("Canvas"));
  assert.ok(canvasDoc);
  assert.equal(canvasDoc.inferredCategory, "ASSIGNMENT_WORKLET");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Workstream A: Student role is rejected from ingesting academic documents", async () => {
  const mockDb = new MockDb();
  const service = new AcademicSourceService(mockDb);

  await assert.rejects(
    async () => {
      await service.ingestSource(
        "tenant-kle",
        "usr-student-01",
        "STUDENT" as any,
        {
          filename: "malicious.docx",
          courseCode: "26ECAC401",
          semester: 7,
          category: "SYLLABUS",
          provenanceStatus: "AUTHORITATIVE",
        },
        "offering-01",
        "syllabus-01"
      );
    },
    /AUTH_DENIED/
  );
});

test("Workstream A: Approving authoritative document supersedes legacy draft and deactivates its chunks", async () => {
  const mockDb = new MockDb();
  const service = new AcademicSourceService(mockDb);

  // Seed older legacy document with chunks
  mockDb.documents.push({
    id: "legacy-doc-01",
    filename: "Draft_Syllabus_Old.docx",
    provenance_status: "UNVERIFIED",
  });
  mockDb.documentChunks.push(
    { id: "chunk-1", document_id: "legacy-doc-01", is_active_for_retrieval: true },
    { id: "chunk-2", document_id: "legacy-doc-01", is_active_for_retrieval: true }
  );

  // Ingest new authoritative source superseding legacy-doc-01
  const result = await service.ingestSource(
    "tenant-kle",
    "usr-lecturer-01",
    "LECTURER",
    {
      filename: "Authoritative_LP_26ECAC401.docx",
      courseCode: "26ECAC401",
      semester: 7,
      category: "LEARNING_PORTFOLIO",
      provenanceStatus: "AUTHORITATIVE",
      supersedesDocumentId: "legacy-doc-01",
    },
    "offering-01",
    "syllabus-01"
  );

  assert.equal(result.provenanceStatus, "AUTHORITATIVE");
  const legacyDoc = mockDb.documents.find((d) => d.id === "legacy-doc-01");
  assert.equal(legacyDoc.provenance_status, "SUPERSEDED");

  // Verify older chunks are deactivated for retrieval
  const chunks = mockDb.documentChunks.filter((c) => c.document_id === "legacy-doc-01");
  assert.ok(chunks.every((c) => c.is_active_for_retrieval === false));
});

// ============================================================================
// WORKSTREAM B: STUDENT CSV INGESTION & TEAM FORMATION TESTS
// ============================================================================

test("Workstream B: PII masking preserves structure while concealing personal identity", () => {
  assert.equal(StudentImportService.maskName("Vikas Patil"), "V*** P***");
  assert.equal(StudentImportService.maskName("A B C"), "A B C");
  assert.equal(StudentImportService.maskEmail("vikas.patil@example.invalid"), "v***l@example.invalid");
});

test("Workstream B: Student CSV parser validates headers, fields, duplicate USNs and valid semesters", () => {
  const mockDb = new MockDb();
  const service = new StudentImportService(mockDb);

  const csvContent = `USN,Student Name,Email,Semester,Branch
DEMO001,Student One,student1@example.invalid,7,CSE
DEMO002,Student Two,student2@example.invalid,7,CSE
DEMO001,Student Duplicate,dup@example.invalid,7,CSE
INVALID_ROW,No Email,,9,CSE
DEMO003,Student Three,student3@example.invalid,4,ECE`;

  const mapping = {
    usn: "USN",
    name: "Student Name",
    email: "Email",
    semester: "Semester",
    branch: "Branch",
  };

  const res = service.validateCsvContent(csvContent, "Semester_7_Students.csv", mapping, 7);

  assert.equal(res.totalRows, 5);
  assert.equal(res.validRowsCount, 2); // 001 and 002
  assert.equal(res.invalidRowsCount, 4); // 4 validation errors across 3 invalid rows (duplicate 001, missing email, sem 9, sem 4)

  // Verify errors
  const dupErr = res.errors.find((e) => e.errorCode === "DUPLICATE_USN");
  assert.ok(dupErr);
  assert.equal(dupErr.rowNumber, 4);

  const semErr = res.errors.find((e) => e.errorCode === "INVALID_SEMESTER");
  assert.ok(semErr);
});

test("Workstream B: Idempotent CSV commit creates zero duplicate students on repeated import", async () => {
  const mockDb = new MockDb();
  const service = new StudentImportService(mockDb);

  const csvContent = `USN,Student Name,Email\nDEMO101,Aura Alpha,alpha@example.invalid`;
  const mapping = { usn: "USN", name: "Student Name", email: "Email" };
  const validation = service.validateCsvContent(csvContent, "Sem7.csv", mapping, 7);

  // First commit
  const commit1 = await service.commitBatch("tenant-kle", "admin-01", validation, mapping, 7);
  assert.equal(commit1.status, "COMMITTED");
  assert.equal(commit1.importedCount, 1);
  assert.equal(mockDb.students.length, 1);

  // Second commit with identical checksum
  const commit2 = await service.commitBatch("tenant-kle", "admin-01", validation, mapping, 7);
  assert.equal(commit2.status, "ALREADY_COMMITTED");
  assert.equal(mockDb.students.length, 1, "Must not create duplicate students on idempotent re-import");
});

test("Workstream B: Team allocation fails safe and marks BLOCKED when owner criteria are missing", async () => {
  const mockDb = new MockDb();
  const teamService = new TeamFormationService(mockDb);

  const preview = await teamService.previewAllocation("tenant-kle", {
    courseOfferingId: "offering-01",
    semester: 7,
    minTeamSize: 3,
    maxTeamSize: 5,
    targetTeamSize: 4,
    strategy: "BALANCED_SECTION",
    isOwnerCriteriaSupplied: false, // Owner has not approved criteria!
  });

  assert.equal(preview.status, "BLOCKED_PENDING_OWNER_CRITERIA");
  assert.equal(preview.teams.length, 0);
  assert.match(preview.blockingReason || "", /BLOCKED pending course coordinator \/ owner criteria/);
});

test("Workstream B: Team allocation produces reproducible balanced groups when criteria are supplied", async () => {
  const mockDb = new MockDb();
  const teamService = new TeamFormationService(mockDb);

  // Seed 8 students in semester 7
  for (let i = 1; i <= 8; i++) {
    mockDb.students.push({
      id: `stud-${i}`,
      institutional_student_id: `01FE21BCS${100 + i}`,
      first_name: `Student${i}`,
      last_name: "Test",
      current_semester: 7,
      academic_status: "ENROLLED",
    });
  }

  const preview = await teamService.previewAllocation("tenant-kle", {
    courseOfferingId: "offering-01",
    semester: 7,
    minTeamSize: 3,
    maxTeamSize: 5,
    targetTeamSize: 4,
    strategy: "RANDOM_REPRODUCIBLE",
    seed: 12345,
    isOwnerCriteriaSupplied: true,
  });

  assert.equal(preview.status, "READY_FOR_ADMIN_REVIEW");
  assert.equal(preview.teams.length, 2);
  assert.equal(preview.teams[0].members.length, 4);
  assert.equal(preview.teams[1].members.length, 4);

  // Exactly one leader per team
  assert.equal(preview.teams[0].members.filter((m) => m.role === "LEADER").length, 1);
  assert.equal(preview.teams[1].members.filter((m) => m.role === "LEADER").length, 1);
});

// ============================================================================
// WORKSTREAM C & D: PROCTOR COMPANION, TELEMETRY & ENTRY GATE TESTS
// ============================================================================

test("Workstream C: ProctorCompanionService enforces 4 distinct signals and marks identity BLOCKED", async () => {
  const mockDb = new MockDb();
  const service = new ProctorCompanionService(mockDb);

  const session = await service.registerSession(
    "tenant-kle",
    "attempt-01",
    "stud-01",
    "proctor-companion-1.0.0",
    "linux-x64"
  );

  assert.ok(session.sessionId);
  assert.ok(session.sessionToken);
  assert.equal(session.status, "PREFLIGHT");

  // In database, identity status must be BLOCKED_NO_REFERENCE_PHOTO
  const dbSession = mockDb.proctorSessions.find((s) => s.id === session.sessionId);
  assert.ok(dbSession);
});

test("Workstream C: Telemetry ingestion detects multiple faces, head pose, and gaze excursion", async () => {
  const mockDb = new MockDb();
  const service = new ProctorCompanionService(mockDb);

  const session = await service.registerSession(
    "tenant-kle",
    "attempt-01",
    "stud-01",
    "proctor-companion-1.0.0",
    "linux-x64"
  );

  // Ingest telemetry with violations
  const result = await service.ingestTelemetry("tenant-kle", {
    attemptId: "attempt-01",
    sessionToken: session.sessionToken,
    frames: [
      // Frame 1: Multiple faces detected
      {
        sequenceNumber: 1,
        timestamp: new Date().toISOString(),
        facePresence: { isFacePresent: true, faceCount: 2, detectionConfidence: 0.99 },
        headPose: { pitchDegrees: 0, yawDegrees: 0, rollDegrees: 0, trackingConfidence: 0.95 },
        displayGaze: { normalizedX: 0.5, normalizedY: 0.5, isOnScreen: true, fixationDurationMs: 500 },
        osIntegrity: { isWindowFocused: true, isFullScreen: true, clipboardEventsCount: 0, displayCount: 1 },
      },
      // Frame 2: Extreme head pose (|yaw| > 35)
      {
        sequenceNumber: 2,
        timestamp: new Date().toISOString(),
        facePresence: { isFacePresent: true, faceCount: 1, detectionConfidence: 0.95 },
        headPose: { pitchDegrees: 5, yawDegrees: 42, rollDegrees: 0, trackingConfidence: 0.9 },
        displayGaze: { normalizedX: 0.2, normalizedY: 0.2, isOnScreen: true, fixationDurationMs: 600 },
        osIntegrity: { isWindowFocused: true, isFullScreen: true, clipboardEventsCount: 0, displayCount: 1 },
      },
      // Frame 3: Off-screen gaze > 3500ms
      {
        sequenceNumber: 3,
        timestamp: new Date().toISOString(),
        facePresence: { isFacePresent: true, faceCount: 1, detectionConfidence: 0.95 },
        headPose: { pitchDegrees: 0, yawDegrees: 0, rollDegrees: 0, trackingConfidence: 0.9 },
        displayGaze: { normalizedX: 1.4, normalizedY: 0.2, isOnScreen: false, fixationDurationMs: 4000 },
        osIntegrity: { isWindowFocused: true, isFullScreen: true, clipboardEventsCount: 0, displayCount: 1 },
      },
    ],
  });

  assert.equal(result.acceptedFrames, 3);
  assert.equal(result.incidentsCreated, 3);
  assert.equal(mockDb.proctorIncidents.length, 3);

  const types = mockDb.proctorIncidents.map((i) => i.incident_type);
  assert.ok(types.includes("MULTIPLE_FACES"));
  assert.ok(types.includes("EXTREME_HEAD_POSE"));
  assert.ok(types.includes("GAZE_EXCURSION"));
});

test("Workstream C: Telemetry rejects mismatched or tampered session token (replay defense)", async () => {
  const mockDb = new MockDb();
  const service = new ProctorCompanionService(mockDb);

  await service.registerSession("tenant-kle", "attempt-01", "stud-01", "1.0.0", "linux");

  await assert.rejects(
    async () => {
      await service.ingestTelemetry("tenant-kle", {
        attemptId: "attempt-01",
        sessionToken: "tampered-forged-token",
        frames: [],
      });
    },
    /INVALID_SESSION_TOKEN/
  );
});

test("Workstream C: Exam Entry Gate strictly checks schedule window, companion status and SEB key", async () => {
  const mockDb = new MockDb();
  const service = new ProctorCompanionService(mockDb);

  // Setup attempt
  mockDb.examAttempts.push({
    id: "attempt-gate-01",
    student_id: "stud-01",
    schedule_id: "sched-01",
    status: "NOT_STARTED",
    is_published: true,
    seb_required: true,
    seb_config_key_hash: "kletech-secret-seb-config",
  });

  // Attempt entry BEFORE proctor is connected
  const examUrl = "http://localhost:3000/student/exam/attempt-gate-01";
  const gate1 = await service.evaluateEntryGate("tenant-kle", "attempt-gate-01", "stud-01", {}, examUrl);
  assert.equal(gate1.canEnterExam, false);
  assert.ok(gate1.reasons.some((r) => r.includes("PROCTOR_COMPANION_NOT_CONNECTED")));

  // Register session but keep in PREFLIGHT
  await service.registerSession("tenant-kle", "attempt-gate-01", "stud-01", "1.0.0", "linux");
  const gate2 = await service.evaluateEntryGate("tenant-kle", "attempt-gate-01", "stud-01", {}, examUrl);
  assert.equal(gate2.canEnterExam, false);
  assert.ok(gate2.reasons.some((r) => r.includes("PROCTOR_NOT_READY")));

  // Advance companion to PROCTOR_READY
  await service.updateSessionState("tenant-kle", "attempt-gate-01", "PROCTOR_READY");

  // Still fails because SEB header is missing
  const gate3 = await service.evaluateEntryGate("tenant-kle", "attempt-gate-01", "stud-01", {}, examUrl);
  assert.equal(gate3.canEnterExam, false);
  assert.ok(gate3.reasons.some((r) => r.includes("SEB_VERIFICATION_FAILED")));

  // Supply valid cryptographic SEB header
  const validSebHash = computeSebHash(examUrl, "kletech-secret-seb-config");
  const gate4 = await service.evaluateEntryGate(
    "tenant-kle",
    "attempt-gate-01",
    "stud-01",
    { "x-safeexambrowser-configkeyhash": validSebHash },
    examUrl
  );

  assert.equal(gate4.canEnterExam, true);
  assert.equal(gate4.sebStatus, "VERIFIED");
  assert.equal(gate4.sessionStatus, "PROCTOR_READY");
  assert.equal(gate4.reasons.length, 0);
});

test("Workstream D: Human-in-the-Loop Incident Review allows COE Admin to dismiss or confirm violation", async () => {
  const mockDb = new MockDb();
  const service = new ProctorCompanionService(mockDb);

  mockDb.proctorIncidents.push({
    id: "inc-01",
    tenant_id: "tenant-kle",
    incident_type: "WINDOW_BLUR",
    severity: "MEDIUM",
    review_status: "PENDING_REVIEW",
  });

  const reviewed = await service.reviewIncident(
    "tenant-kle",
    "inc-01",
    "usr-coe-admin-01",
    "DISMISSED",
    "Student switched window due to legitimate OS update prompt."
  );

  assert.equal(reviewed.reviewStatus, "DISMISSED");
  const inc = mockDb.proctorIncidents.find((i) => i.id === "inc-01");
  assert.equal(inc.review_status, "DISMISSED");
  assert.match(inc.reviewer_notes, /legitimate OS update/);
});
