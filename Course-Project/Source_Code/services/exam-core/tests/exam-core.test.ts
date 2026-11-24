import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthoritativeExamEngine,
  IneligibleStudentError,
  AttemptLimitExceededError,
  ExamWindowClosedError,
  ExamSessionExpiredError,
  UnauthorizedExamActionError,
  StaleAutosaveSequenceError,
  ResultsNotPublishedError,
  InvalidExamTransitionError,
} from "../src/index.ts";
import type { TenantActorContext, ScheduleInfo, QuestionGradingKey } from "../src/index.ts";

const studentCtx: TenantActorContext = {
  tenantId: "tenant-001",
  userId: "student-100",
  role: "STUDENT",
};

const lecturerCtx: TenantActorContext = {
  tenantId: "tenant-001",
  userId: "faculty-200",
  role: "LECTURER",
};

const coeAdminCtx: TenantActorContext = {
  tenantId: "tenant-001",
  userId: "coe-300",
  role: "COE_ADMIN",
};

const validSchedule: ScheduleInfo = {
  id: "sched-001",
  tenantId: "tenant-001",
  courseOfferingId: "offering-001",
  blueprintId: "bp-001",
  startTime: "2026-11-12T10:00:00.000Z",
  endTime: "2026-11-12T14:00:00.000Z",
  durationMinutes: 60,
  totalMarks: 50,
  allowedAttempts: 1,
  status: "SCHEDULED",
};

test("Exam Core: Eligible student inside window successfully starts attempt", () => {
  const engine = new AuthoritativeExamEngine();
  const session = engine.startAttempt({
    actor: studentCtx,
    schedule: validSchedule,
    isEligible: true,
    previousAttemptsCount: 0,
    currentTimeIso: "2026-11-12T10:30:00.000Z",
  });

  assert.equal(session.status, "IN_PROGRESS");
  assert.equal(session.studentId, "student-100");
  assert.equal(session.attemptNumber, 1);
  assert.equal(session.serverStartTime, "2026-11-12T10:30:00.000Z");
  assert.equal(session.serverDeadline, "2026-11-12T11:30:00.000Z"); // 60 mins later
});

test("Exam Core: Ineligible student is rejected from starting attempt", () => {
  const engine = new AuthoritativeExamEngine();
  assert.throws(
    () =>
      engine.startAttempt({
        actor: studentCtx,
        schedule: validSchedule,
        isEligible: false, // Ineligible!
        previousAttemptsCount: 0,
        currentTimeIso: "2026-11-12T10:30:00.000Z",
      }),
    IneligibleStudentError
  );
});

test("Exam Core: Attempt outside scheduled window is rejected", () => {
  const engine = new AuthoritativeExamEngine();
  // Too early
  assert.throws(
    () =>
      engine.startAttempt({
        actor: studentCtx,
        schedule: validSchedule,
        isEligible: true,
        previousAttemptsCount: 0,
        currentTimeIso: "2026-11-12T09:30:00.000Z",
      }),
    ExamWindowClosedError
  );

  // Too late
  assert.throws(
    () =>
      engine.startAttempt({
        actor: studentCtx,
        schedule: validSchedule,
        isEligible: true,
        previousAttemptsCount: 0,
        currentTimeIso: "2026-11-12T14:30:00.000Z",
      }),
    ExamWindowClosedError
  );
});

test("Exam Core: Exceeding allowed attempts is rejected", () => {
  const engine = new AuthoritativeExamEngine();
  assert.throws(
    () =>
      engine.startAttempt({
        actor: studentCtx,
        schedule: validSchedule,
        isEligible: true,
        previousAttemptsCount: 1, // Max allowed is 1!
        currentTimeIso: "2026-11-12T10:30:00.000Z",
      }),
    AttemptLimitExceededError
  );
});

test("Exam Core: Autosave updates responses and enforces sequence ordering", () => {
  const engine = new AuthoritativeExamEngine();
  const session = engine.startAttempt({
    actor: studentCtx,
    schedule: validSchedule,
    isEligible: true,
    previousAttemptsCount: 0,
    currentTimeIso: "2026-11-12T10:00:00.000Z",
  });

  // Autosave sequence 1
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-1",
    answer: "A",
    sequenceNumber: 1,
    currentTimeIso: "2026-11-12T10:05:00.000Z",
  });

  // Autosave sequence 2 updates q-1
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-1",
    answer: "B",
    sequenceNumber: 2,
    currentTimeIso: "2026-11-12T10:06:00.000Z",
  });

  const updated = engine.getSession(session.id, studentCtx);
  assert.equal(updated.responses["q-1"].answer, "B");
  assert.equal(updated.responses["q-1"].sequenceNumber, 2);

  // Stale sequence 1 is rejected
  assert.throws(
    () =>
      engine.autosave({
        actor: studentCtx,
        sessionId: session.id,
        questionId: "q-1",
        answer: "C",
        sequenceNumber: 1, // Out of order!
        currentTimeIso: "2026-11-12T10:07:00.000Z",
      }),
    StaleAutosaveSequenceError
  );
});

test("Exam Core: Autosave after server deadline auto-submits and rejects write", () => {
  const engine = new AuthoritativeExamEngine();
  const session = engine.startAttempt({
    actor: studentCtx,
    schedule: validSchedule,
    isEligible: true,
    previousAttemptsCount: 0,
    currentTimeIso: "2026-11-12T10:00:00.000Z",
  });

  // Attempt autosave at 11:05 (Deadline was 11:00 + 30s grace)
  assert.throws(
    () =>
      engine.autosave({
        actor: studentCtx,
        sessionId: session.id,
        questionId: "q-1",
        answer: "A",
        sequenceNumber: 1,
        currentTimeIso: "2026-11-12T11:05:00.000Z",
      }),
    ExamSessionExpiredError
  );

  const updated = engine.getSession(session.id, studentCtx);
  assert.equal(updated.status, "SUBMITTED");
});

test("Exam Core: Integrity signals are recorded as telemetry without terminating exam", () => {
  const engine = new AuthoritativeExamEngine();
  const session = engine.startAttempt({
    actor: studentCtx,
    schedule: validSchedule,
    isEligible: true,
    previousAttemptsCount: 0,
    currentTimeIso: "2026-11-12T10:00:00.000Z",
  });

  engine.recordIntegritySignal({
    actor: studentCtx,
    sessionId: session.id,
    signalType: "FOCUS_LOST",
    metadata: { durationMs: 1200 },
  });

  engine.recordIntegritySignal({
    actor: studentCtx,
    sessionId: session.id,
    signalType: "TAB_SWITCH",
  });

  const updated = engine.getSession(session.id, studentCtx);
  assert.equal(updated.status, "IN_PROGRESS");
  assert.equal(updated.integritySignals.length, 2);
  assert.equal(updated.integritySignals[0].type, "FOCUS_LOST");
});

test("Exam Core: Full Submission, Deterministic Grading, and COE Release Flow", () => {
  const engine = new AuthoritativeExamEngine();
  const session = engine.startAttempt({
    actor: studentCtx,
    schedule: validSchedule,
    isEligible: true,
    previousAttemptsCount: 0,
    currentTimeIso: "2026-11-12T10:00:00.000Z",
  });

  // 1. Student answers questions
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-mcq-1",
    answer: "A",
    sequenceNumber: 1,
    currentTimeIso: "2026-11-12T10:10:00.000Z",
  });
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-mcq-2",
    answer: ["A", "C"],
    sequenceNumber: 2,
    currentTimeIso: "2026-11-12T10:15:00.000Z",
  });
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-sql-1",
    answer: "SELECT * FROM students WHERE id = 1",
    sequenceNumber: 3,
    currentTimeIso: "2026-11-12T10:20:00.000Z",
  });
  engine.autosave({
    actor: studentCtx,
    sessionId: session.id,
    questionId: "q-essay-1",
    answer: "Relational normalization eliminates redundancy.",
    sequenceNumber: 4,
    currentTimeIso: "2026-11-12T10:25:00.000Z",
  });

  // 2. Student submits attempt
  const submitted = engine.submitAttempt({
    actor: studentCtx,
    sessionId: session.id,
    currentTimeIso: "2026-11-12T10:30:00.000Z",
  });
  assert.equal(submitted.status, "SUBMITTED");
  assert.ok(submitted.submittedAt);

  // 3. Double submission is rejected
  assert.throws(
    () =>
      engine.submitAttempt({
        actor: studentCtx,
        sessionId: session.id,
      }),
    InvalidExamTransitionError
  );

  // 4. Deterministic Server-Side Objective Grading
  const gradingKeys: QuestionGradingKey[] = [
    { questionId: "q-mcq-1", questionType: "MCQ_SINGLE", correctAnswer: "A", marks: 10, isObjective: true },
    { questionId: "q-mcq-2", questionType: "MCQ_MULTIPLE", correctAnswer: ["A", "C"], marks: 10, isObjective: true },
    { questionId: "q-sql-1", questionType: "SQL_DESIGN", correctAnswer: "select * from students where id = 1", marks: 10, isObjective: true },
    { questionId: "q-essay-1", questionType: "LONG_ANSWER", correctAnswer: "", marks: 20, isObjective: false },
  ];

  const scored = engine.gradeObjective(session.id, gradingKeys);
  assert.equal(scored.objectiveScore, 30); // 10 + 10 + 10 earned!
  assert.equal(scored.status, "FACULTY_REVIEW"); // Essay question awaits subjective review

  // 5. Faculty Subjective Review
  engine.gradeSubjective({
    actor: lecturerCtx,
    sessionId: session.id,
    grades: [{ questionId: "q-essay-1", awardedMarks: 15, feedback: "Good explanation" }],
    maxSubjectiveMarks: 20,
  });

  const reviewed = engine.getSession(session.id, lecturerCtx);
  assert.equal(reviewed.subjectiveScore, 15);
  assert.equal(reviewed.totalScore, 45); // 30 obj + 15 subj = 45 / 50 marks!

  // 6. Student attempts to view result before COE release -> REJECTED
  assert.throws(
    () => engine.getStudentResult(studentCtx, session.id),
    ResultsNotPublishedError
  );

  // 7. COE Administrator officially releases results
  engine.releaseResults(coeAdminCtx, session.id);

  // 8. Student queries released result
  const result = engine.getStudentResult(studentCtx, session.id);
  assert.equal(result.totalScore, 45);
  assert.equal(result.maxMarks, 50);
  assert.equal(result.percentage, 90);
});
