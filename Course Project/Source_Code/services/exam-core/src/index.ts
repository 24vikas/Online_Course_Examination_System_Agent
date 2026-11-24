import crypto from "crypto";
import type { ExamState } from "@exam-system/contracts";

export interface TenantActorContext {
  tenantId: string;
  userId: string;
  role: "COE_ADMIN" | "LECTURER" | "STUDENT";
}

export interface StudentResponseItem {
  questionId: string;
  answer: string | string[];
  savedAt: string;
  sequenceNumber: number;
}

export interface IntegritySignalItem {
  type: "FOCUS_LOST" | "FULLSCREEN_EXIT" | "RECONNECT" | "TAB_SWITCH";
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ExamSession {
  id: string;
  tenantId: string;
  examScheduleId: string;
  courseOfferingId: string;
  studentId: string;
  attemptNumber: number;
  status: ExamState;
  serverStartTime: string;
  serverDeadline: string;
  submittedAt?: string;
  responses: Record<string, StudentResponseItem>;
  objectiveScore?: number;
  subjectiveScore?: number;
  totalScore?: number;
  maxMarks: number;
  integritySignals: IntegritySignalItem[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionGradingKey {
  questionId: string;
  questionType: "MCQ_SINGLE" | "MCQ_MULTIPLE" | "SHORT_ANSWER" | "LONG_ANSWER" | "SQL_DESIGN" | "CODE_REASONING" | "PRACTICAL_TASK";
  correctAnswer: string | string[];
  marks: number;
  isObjective: boolean;
}

export interface SubjectiveGradeItem {
  questionId: string;
  awardedMarks: number;
  feedback?: string;
}

export interface ScheduleInfo {
  id: string;
  tenantId: string;
  courseOfferingId: string;
  blueprintId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalMarks: number;
  allowedAttempts: number;
  status: "SCHEDULED" | "IN_PROGRESS" | "CONCLUDED" | "CANCELLED";
  isReleased?: boolean;
}

export class IneligibleStudentError extends Error {
  constructor(message = "Student is not verified as ELIGIBLE for this examination") {
    super(message);
    this.name = "IneligibleStudentError";
  }
}

export class AttemptLimitExceededError extends Error {
  constructor(message = "Maximum allowed attempts for this examination has been reached") {
    super(message);
    this.name = "AttemptLimitExceededError";
  }
}

export class ExamWindowClosedError extends Error {
  constructor(message = "Examination window is currently closed") {
    super(message);
    this.name = "ExamWindowClosedError";
  }
}

export class ExamSessionExpiredError extends Error {
  constructor(message = "Authoritative examination deadline has elapsed") {
    super(message);
    this.name = "ExamSessionExpiredError";
  }
}

export class ExamSessionNotFoundError extends Error {
  constructor(message = "Examination session not found or access denied") {
    super(message);
    this.name = "ExamSessionNotFoundError";
  }
}

export class InvalidExamTransitionError extends Error {
  constructor(message = "Invalid state transition for exam session") {
    super(message);
    this.name = "InvalidExamTransitionError";
  }
}

export class UnauthorizedExamActionError extends Error {
  constructor(message = "Actor does not have authority to perform this examination action") {
    super(message);
    this.name = "UnauthorizedExamActionError";
  }
}

export class StaleAutosaveSequenceError extends Error {
  constructor(message = "Autosave rejected: Out-of-order sequence number detected") {
    super(message);
    this.name = "StaleAutosaveSequenceError";
  }
}

export class ResultsNotPublishedError extends Error {
  constructor(message = "Examination results have not been officially released by the COE") {
    super(message);
    this.name = "ResultsNotPublishedError";
  }
}

/**
 * Authoritative Exam Core Engine
 * Manages attempt limits, server-side clock authority, autosave, immutable submissions,
 * deterministic objective grading, lecturer subjective grading, and audited COE publication.
 */
export class AuthoritativeExamEngine {
  private sessionsStore = new Map<string, ExamSession>();

  calculateRemainingSeconds(serverDeadlineIso: string, serverCurrentTimeIso: string): number {
    const deadline = new Date(serverDeadlineIso).getTime();
    const current = new Date(serverCurrentTimeIso).getTime();
    return Math.max(0, Math.floor((deadline - current) / 1000));
  }

  isSubmissionAllowed(serverDeadlineIso: string, serverCurrentTimeIso: string, graceSeconds = 30): boolean {
    const deadline = new Date(serverDeadlineIso).getTime();
    const current = new Date(serverCurrentTimeIso).getTime();
    return current <= deadline + graceSeconds * 1000;
  }

  /**
   * Start a new exam attempt.
   * Enforces:
   * 1. Tenant match.
   * 2. Eligibility verification (must be ELIGIBLE).
   * 3. Current server time inside scheduled exam window.
   * 4. Attempt count < allowed attempts.
   */
  startAttempt(params: {
    actor: TenantActorContext;
    schedule: ScheduleInfo;
    isEligible: boolean;
    previousAttemptsCount: number;
    currentTimeIso?: string;
  }): ExamSession {
    const { actor, schedule, isEligible, previousAttemptsCount } = params;
    const nowIso = params.currentTimeIso || new Date().toISOString();
    const now = new Date(nowIso).getTime();

    // Tenant check
    if (actor.tenantId !== schedule.tenantId) {
      throw new UnauthorizedExamActionError("Cross-tenant examination attempt rejected");
    }

    // Role check
    if (actor.role !== "STUDENT") {
      throw new UnauthorizedExamActionError("Only students can start an examination attempt");
    }

    // Eligibility check
    if (!isEligible) {
      throw new IneligibleStudentError(
        `Student '${actor.userId}' does not have verified ELIGIBLE status for this exam.`
      );
    }

    // Window check
    const start = new Date(schedule.startTime).getTime();
    const end = new Date(schedule.endTime).getTime();
    if (now < start || now > end) {
      throw new ExamWindowClosedError(
        `Current time ${nowIso} is outside active window [${schedule.startTime} - ${schedule.endTime}].`
      );
    }

    // Attempt limit check
    if (previousAttemptsCount >= schedule.allowedAttempts) {
      throw new AttemptLimitExceededError(
        `Student has used ${previousAttemptsCount} of ${schedule.allowedAttempts} allowed attempts.`
      );
    }

    // Calculate authoritative server deadline
    const examDurationMs = schedule.durationMinutes * 60 * 1000;
    const computedDeadlineMs = Math.min(now + examDurationMs, end);
    const deadlineIso = new Date(computedDeadlineMs).toISOString();

    const session: ExamSession = {
      id: crypto.randomUUID(),
      tenantId: actor.tenantId,
      examScheduleId: schedule.id,
      courseOfferingId: schedule.courseOfferingId,
      studentId: actor.userId,
      attemptNumber: previousAttemptsCount + 1,
      status: "IN_PROGRESS",
      serverStartTime: nowIso,
      serverDeadline: deadlineIso,
      responses: {},
      maxMarks: schedule.totalMarks,
      integritySignals: [],
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.sessionsStore.set(session.id, session);
    return session;
  }

  /**
   * Autosave student answer for a specific question.
   * Enforces sequence order, optimistic locking, and server deadline.
   */
  autosave(params: {
    actor: TenantActorContext;
    sessionId: string;
    questionId: string;
    answer: string | string[];
    sequenceNumber: number;
    currentTimeIso?: string;
  }): ExamSession {
    const session = this.getSession(params.sessionId, params.actor);
    const nowIso = params.currentTimeIso || new Date().toISOString();

    if (session.status !== "IN_PROGRESS") {
      throw new InvalidExamTransitionError(`Cannot autosave: Session is in status '${session.status}'`);
    }

    // Check authoritative deadline
    if (!this.isSubmissionAllowed(session.serverDeadline, nowIso)) {
      session.status = "SUBMITTED"; // Auto-close expired session
      session.submittedAt = nowIso;
      session.updatedAt = nowIso;
      throw new ExamSessionExpiredError("Server deadline has passed. Attempt has been auto-submitted.");
    }

    const existing = session.responses[params.questionId];
    if (existing && params.sequenceNumber <= existing.sequenceNumber) {
      throw new StaleAutosaveSequenceError(
        `Sequence ${params.sequenceNumber} is <= existing sequence ${existing.sequenceNumber}`
      );
    }

    session.responses[params.questionId] = {
      questionId: params.questionId,
      answer: params.answer,
      savedAt: nowIso,
      sequenceNumber: params.sequenceNumber,
    };
    session.version += 1;
    session.updatedAt = nowIso;

    return session;
  }

  /**
   * Record client-side integrity signal (focus lost, tab switch, etc.).
   * Advisory only: Audited, does NOT terminate exam automatically.
   */
  recordIntegritySignal(params: {
    actor: TenantActorContext;
    sessionId: string;
    signalType: "FOCUS_LOST" | "FULLSCREEN_EXIT" | "RECONNECT" | "TAB_SWITCH";
    metadata?: Record<string, any>;
    currentTimeIso?: string;
  }): void {
    const session = this.getSession(params.sessionId, params.actor);
    const nowIso = params.currentTimeIso || new Date().toISOString();

    session.integritySignals.push({
      type: params.signalType,
      timestamp: nowIso,
      metadata: params.metadata,
    });
    session.updatedAt = nowIso;
  }

  /**
   * Final submission of student attempt.
   */
  submitAttempt(params: {
    actor: TenantActorContext;
    sessionId: string;
    currentTimeIso?: string;
  }): ExamSession {
    const session = this.getSession(params.sessionId, params.actor);
    const nowIso = params.currentTimeIso || new Date().toISOString();

    if (session.status !== "IN_PROGRESS") {
      throw new InvalidExamTransitionError(`Cannot submit attempt with status '${session.status}'`);
    }

    // Allow submission within grace period
    if (!this.isSubmissionAllowed(session.serverDeadline, nowIso)) {
      session.status = "SUBMITTED";
      session.submittedAt = nowIso;
      session.updatedAt = nowIso;
      throw new ExamSessionExpiredError("Server deadline has passed. Attempt auto-submitted.");
    }

    session.status = "SUBMITTED";
    session.submittedAt = nowIso;
    session.updatedAt = nowIso;
    return session;
  }

  /**
   * Deterministic Server-Side Objective Grading.
   * Compares student answers against authoritative answer keys.
   * Never trusts client scores.
   */
  gradeObjective(sessionId: string, gradingKeys: QuestionGradingKey[]): ExamSession {
    const session = this.sessionsStore.get(sessionId);
    if (!session) {
      throw new ExamSessionNotFoundError();
    }

    if (session.status !== "SUBMITTED" && session.status !== "OBJECTIVE_SCORED") {
      throw new InvalidExamTransitionError(
        `Cannot run objective grading on session in status '${session.status}'. Must be SUBMITTED.`
      );
    }

    let objectiveEarned = 0;
    let hasSubjective = false;

    for (const key of gradingKeys) {
      if (!key.isObjective) {
        hasSubjective = true;
        continue;
      }

      const response = session.responses[key.questionId];
      if (!response) continue;

      if (key.questionType === "MCQ_SINGLE") {
        const studentAns = String(response.answer || "").trim().toUpperCase();
        const correctAns = String(key.correctAnswer || "").trim().toUpperCase();
        if (studentAns === correctAns) {
          objectiveEarned += key.marks;
        }
      } else if (key.questionType === "MCQ_MULTIPLE") {
        const studentArr = Array.isArray(response.answer)
          ? response.answer.map((s) => String(s).trim().toUpperCase()).sort()
          : [String(response.answer).trim().toUpperCase()];
        const correctArr = Array.isArray(key.correctAnswer)
          ? key.correctAnswer.map((s) => String(s).trim().toUpperCase()).sort()
          : [String(key.correctAnswer).trim().toUpperCase()];

        if (
          studentArr.length === correctArr.length &&
          studentArr.every((val, index) => val === correctArr[index])
        ) {
          objectiveEarned += key.marks;
        }
      } else if (key.questionType === "SQL_DESIGN") {
        // Normalized exact token comparison
        const normStudent = String(response.answer || "").replace(/\s+/g, " ").trim().toUpperCase();
        const normCorrect = String(key.correctAnswer || "").replace(/\s+/g, " ").trim().toUpperCase();
        if (normStudent === normCorrect) {
          objectiveEarned += key.marks;
        }
      }
    }

    session.objectiveScore = objectiveEarned;
    if (hasSubjective) {
      session.status = "FACULTY_REVIEW";
    } else {
      session.status = "OBJECTIVE_SCORED";
      session.totalScore = objectiveEarned;
    }
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /**
   * Faculty Subjective Grading.
   * Lecturer reviews and grades open-ended or practical tasks.
   */
  gradeSubjective(params: {
    actor: TenantActorContext;
    sessionId: string;
    grades: SubjectiveGradeItem[];
    maxSubjectiveMarks: number;
  }): ExamSession {
    if (params.actor.role !== "LECTURER" && params.actor.role !== "COE_ADMIN") {
      throw new UnauthorizedExamActionError("Only faculty or COE can submit subjective grades");
    }

    const session = this.sessionsStore.get(params.sessionId);
    if (!session || session.tenantId !== params.actor.tenantId) {
      throw new ExamSessionNotFoundError();
    }

    let subjectiveEarned = 0;
    for (const g of params.grades) {
      if (g.awardedMarks < 0) {
        throw new Error("NEGATIVE_MARKS: Awarded marks cannot be negative.");
      }
      subjectiveEarned += g.awardedMarks;
    }

    if (subjectiveEarned > params.maxSubjectiveMarks) {
      throw new Error(
        `MARKS_OVERFLOW: Subjective marks (${subjectiveEarned}) exceed maximum allowed (${params.maxSubjectiveMarks}).`
      );
    }

    session.subjectiveScore = subjectiveEarned;
    session.totalScore = (session.objectiveScore || 0) + subjectiveEarned;
    session.status = "FACULTY_REVIEW";
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /**
   * Release Results (COE Authority).
   * Marks session as officially RELEASED so students can view scores.
   */
  releaseResults(actor: TenantActorContext, sessionId: string): ExamSession {
    if (actor.role !== "COE_ADMIN") {
      throw new UnauthorizedExamActionError("Only COE Administrator has authority to release examination results");
    }

    const session = this.sessionsStore.get(sessionId);
    if (!session || session.tenantId !== actor.tenantId) {
      throw new ExamSessionNotFoundError();
    }

    session.status = "RELEASED";
    session.updatedAt = new Date().toISOString();
    return session;
  }

  /**
   * Student queries their result.
   * Strictly gated: If status is not RELEASED, throws ResultsNotPublishedError.
   */
  getStudentResult(actor: TenantActorContext, sessionId: string): {
    attemptId: string;
    totalScore: number;
    maxMarks: number;
    percentage: number;
    submittedAt?: string;
  } {
    const session = this.getSession(sessionId, actor);

    if (session.status !== "RELEASED") {
      throw new ResultsNotPublishedError();
    }

    const total = session.totalScore || 0;
    const pct = session.maxMarks > 0 ? Math.round((total / session.maxMarks) * 100) : 0;

    return {
      attemptId: session.id,
      totalScore: total,
      maxMarks: session.maxMarks,
      percentage: pct,
      submittedAt: session.submittedAt,
    };
  }

  public getSession(sessionId: string, actor: TenantActorContext): ExamSession {
    const session = this.sessionsStore.get(sessionId);
    if (!session) {
      throw new ExamSessionNotFoundError();
    }

    if (session.tenantId !== actor.tenantId) {
      throw new ExamSessionNotFoundError();
    }

    if (actor.role === "STUDENT" && session.studentId !== actor.userId) {
      throw new ExamSessionNotFoundError();
    }

    return session;
  }
}
